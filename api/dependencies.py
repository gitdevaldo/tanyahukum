"""Shared FastAPI dependencies for authentication and rate limiting."""
import logging
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader
from api.config import settings

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(key: str | None = Security(_api_key_header)):
    """Verify the internal API key sent by the Next.js proxy."""
    if not settings.internal_api_key:
        return  # No key configured — skip auth (dev mode)
    if not key or key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="API key tidak valid.")
