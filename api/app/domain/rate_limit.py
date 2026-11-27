"""Thread-safe sliding-window in-memory rate limiter for public share routes."""

from collections import deque
from collections.abc import Callable
import math
import threading
import time

from fastapi import Request

from app.domain.errors import DomainRateLimitError


class InMemoryRateLimiter:
    """Per-key sliding-window rate limiter enforcing max requests per window."""

    def __init__(
        self,
        limit: int = 60,
        window_seconds: int = 60,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if limit <= 0 or window_seconds <= 0:
            raise ValueError("Rate limit and window_seconds must be positive integers.")
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._buckets: dict[str, deque[float]] = {}

    def check(self, key: str) -> None:
        """Record a request for key or raise DomainRateLimitError if window limit exceeded."""
        now = self._clock()
        cutoff = now - self.window_seconds
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = deque()
                self._buckets[key] = bucket

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= self.limit:
                retry_after = max(1, math.ceil(bucket[0] + self.window_seconds - now))
                raise DomainRateLimitError(
                    "Too many requests for share endpoint.",
                    retry_after=retry_after,
                )

            bucket.append(now)

    def reset(self) -> None:
        """Clear all tracked client request windows."""
        with self._lock:
            self._buckets.clear()


def extract_client_ip(request: Request) -> str:
    """Resolve client IP from X-Forwarded-For, X-Real-IP, or ASGI client host."""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first_hop = forwarded_for.split(",", 1)[0].strip()
        if first_hop:
            return first_hop

    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip

    if request.client and request.client.host:
        return request.client.host
    return "unknown"
