"""Domain-layer exceptions mapped to HTTP status codes at the API boundary."""


class DomainError(Exception):
    """Base class for expected domain rule failures."""


class DomainValidationError(DomainError):
    """Raised when domain invariants or timezone rules are violated (HTTP 422)."""


class DomainConflictError(DomainError):
    """Raised on uniqueness conflicts such as duplicate trip slugs or days (HTTP 409)."""


class DomainNotFoundError(DomainError):
    """Raised when a requested domain aggregate or child entity does not exist (HTTP 404)."""
