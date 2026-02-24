"""Pydantic response models."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response for GET /health."""

    status: str
    version: str
    libraries: dict[str, str | None]


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    detail: str | None = None
