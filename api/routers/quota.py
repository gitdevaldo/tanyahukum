"""Quota endpoints (v2.0-A)."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import verify_bearer_token
from api.models.schemas import QuotaResponse
from api.services.supabase_auth import (
    SupabaseServiceError,
    get_auth_user,
    upsert_user_profile_and_quota,
    get_user_profile_and_quota,
)

router = APIRouter()


@router.get("/quota", response_model=QuotaResponse)
async def get_quota(access_token: str = Depends(verify_bearer_token)):
    """Return current authenticated user's quota usage and limits."""
    try:
        auth_user = await asyncio.to_thread(get_auth_user, access_token)
        user_meta = auth_user.get("user_metadata") or {}
        user_id = auth_user["id"]
        email = auth_user.get("email", "")
        name = user_meta.get("name") or auth_user.get("email", "").split("@")[0] or "Pengguna"
        plan = user_meta.get("plan") or "free"

        await asyncio.to_thread(upsert_user_profile_and_quota, user_id, email, name, plan)
        profile = await asyncio.to_thread(get_user_profile_and_quota, user_id)
        return QuotaResponse(
            user_id=profile["user_id"],
            plan=profile["plan"],
            quota=profile["quota"],
        )
    except SupabaseServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
