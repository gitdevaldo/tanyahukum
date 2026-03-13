"""Shared FastAPI dependencies for authentication and rate limiting."""
import logging
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from api.config import settings

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_bearer = HTTPBearer(auto_error=False)


async def verify_api_key(key: str | None = Security(_api_key_header)):
    """Verify the internal API key sent by the Next.js proxy."""
    if not settings.internal_api_key:
        return  # No key configured — skip auth (dev mode)
    if not key or key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="API key tidak valid.")


async def verify_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> str:
    """Extract and validate Bearer token for user-authenticated endpoints."""
    if not credentials or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Bearer token diperlukan.")
    return credentials.credentials
