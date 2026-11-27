"""Domain-layer exceptions mapped to HTTP status codes at the API boundary."""


class DomainError(Exception):
    """Base class for expected domain rule failures."""


class DomainValidationError(DomainError):
    """Raised when domain invariants or timezone rules are violated (HTTP 422)."""


class DomainConflictError(DomainError):
    """Raised on uniqueness conflicts such as duplicate trip slugs or days (HTTP 409)."""


class DomainNotFoundError(DomainError):
    """Raised when a requested domain aggregate or child entity does not exist (HTTP 404)."""


class DomainPayloadTooLargeError(DomainError):
    """Raised when an uploaded payload exceeds size limits (HTTP 413)."""


class DomainRangeNotSatisfiableError(DomainError):
    """Raised when an HTTP Range header cannot be satisfied (HTTP 416)."""

    def __init__(self, message: str, total_size: int) -> None:
        super().__init__(message)
        self.total_size = total_size


class DomainUpstreamError(DomainError):
    """Raised when an upstream external adapter fails or times out (HTTP 502)."""


class DomainGoneError(DomainError):
    """Raised when a capability share token has been revoked or expired (HTTP 410)."""


class DomainRateLimitError(DomainError):
    """Raised when a client exceeds the per-IP request rate limit (HTTP 429)."""

    def __init__(self, message: str, retry_after: int = 60) -> None:
        super().__init__(message)
        self.retry_after = retry_after
