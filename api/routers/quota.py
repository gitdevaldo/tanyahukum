"""Quota endpoints (v2.0-A)."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.dependencies import verify_bearer_token
from api.models.schemas import QuotaResponse
from api.services.supabase_auth import (
    SupabaseServiceError,
    get_auth_user,
    upsert_user_profile_and_quota,
    get_user_profile_and_quota,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/quota", response_model=QuotaResponse)
@limiter.limit("120/minute")
async def get_quota(request: Request, access_token: str = Depends(verify_bearer_token)):
    """Return current authenticated user's quota usage and limits."""
    try:
        auth_user = await asyncio.to_thread(get_auth_user, access_token)
        user_meta = auth_user.get("user_metadata") or {}
        user_id = auth_user["id"]
        email = auth_user.get("email", "")
        name = user_meta.get("name") or auth_user.get("email", "").split("@")[0] or "Pengguna"
        account_type = user_meta.get("account_type")
        plan = user_meta.get("plan") or "free"

        await asyncio.to_thread(
            upsert_user_profile_and_quota,
            user_id,
            email,
            name,
            plan,
            account_type,
        )
        profile = await asyncio.to_thread(get_user_profile_and_quota, user_id)
        return QuotaResponse(
            user_id=profile["user_id"],
            account_type=profile["account_type"],
            plan=profile["plan"],
            quota=profile["quota"],
        )
    except SupabaseServiceError as e:
        if e.status_code >= 500:
            raise HTTPException(status_code=500, detail="Gagal mengambil data quota.")
        raise HTTPException(status_code=e.status_code, detail=e.detail)
