"""Auth endpoints backed by Supabase Auth + Supabase Postgres."""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import verify_bearer_token
from api.models.schemas import (
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    LoginResponse,
    LoginUser,
    AuthMeResponse,
)
from api.services.supabase_auth import (
    SupabaseServiceError,
    register_user,
    login_user,
    get_auth_user,
    upsert_user_profile_and_quota,
    get_user_profile_and_quota,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/auth/register", response_model=RegisterResponse)
async def register(req: RegisterRequest):
    """Create user account in Supabase Auth and bootstrap app profile/quota."""
    try:
        result = await asyncio.to_thread(register_user, req.email, req.password, req.name, req.plan)
        return RegisterResponse(
            success=True,
            message="Registrasi berhasil.",
            user_id=result["user_id"],
            email=result["email"],
            email_confirmed=result["email_confirmed"],
        )
    except SupabaseServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Authenticate with Supabase Auth password grant and return tokens."""
    try:
        result = await asyncio.to_thread(login_user, req.email, req.password)
        user = result.get("user") or {}
        return LoginResponse(
            access_token=result["access_token"],
            refresh_token=result.get("refresh_token", ""),
            token_type=result.get("token_type", "bearer"),
            expires_in=result.get("expires_in", 0),
            user=LoginUser(user_id=user.get("id", ""), email=user.get("email", req.email)),
        )
    except SupabaseServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.get("/auth/me", response_model=AuthMeResponse)
async def me(access_token: str = Depends(verify_bearer_token)):
    """Return authenticated user profile + quota from Supabase."""
    try:
        auth_user = await asyncio.to_thread(get_auth_user, access_token)
        user_meta = auth_user.get("user_metadata") or {}
        user_id = auth_user["id"]
        email = auth_user.get("email", "")
        name = user_meta.get("name") or auth_user.get("email", "").split("@")[0] or "Pengguna"
        plan = user_meta.get("plan") or "free"

        await asyncio.to_thread(upsert_user_profile_and_quota, user_id, email, name, plan)
        profile = await asyncio.to_thread(get_user_profile_and_quota, user_id)
        return AuthMeResponse(**profile)
    except SupabaseServiceError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
