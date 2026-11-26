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
