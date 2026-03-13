"""Auth endpoints backed by Supabase Auth + Supabase Postgres."""
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.dependencies import verify_bearer_token
from api.models.schemas import (
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    LoginResponse,
    LoginUser,
    RefreshRequest,
    RefreshResponse,
    LogoutResponse,
    AuthMeResponse,
)
from api.services.supabase_auth import (
    SupabaseServiceError,
    register_user,
    login_user,
    refresh_session,
    logout_session,
    get_auth_user,
    resolve_account_plan_from_user_meta,
    upsert_user_profile_and_quota,
    get_user_profile_and_quota,
)

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _raise_auth_error(e: SupabaseServiceError, fallback: str) -> None:
    """Sanitize upstream errors to avoid leaking internal service details."""
    if e.status_code >= 500:
        raise HTTPException(status_code=500, detail=fallback)
    raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/auth/register", response_model=RegisterResponse)
@limiter.limit("10/hour")
async def register(request: Request, req: RegisterRequest):
    """Create user account in Supabase Auth and bootstrap app profile/quota."""
    try:
        result = await asyncio.to_thread(
            register_user,
            req.email,
            req.password,
            req.name,
            req.plan,
            req.account_type,
        )
        return RegisterResponse(
            success=True,
            message="Registrasi berhasil.",
            user_id=result["user_id"],
            email=result["email"],
            email_confirmed=result["email_confirmed"],
        )
    except SupabaseServiceError as e:
        _raise_auth_error(e, "Registrasi gagal. Silakan coba lagi.")


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("20/hour")
async def login(request: Request, req: LoginRequest):
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
        _raise_auth_error(e, "Login gagal. Silakan coba lagi.")


@router.post("/auth/refresh", response_model=RefreshResponse)
@limiter.limit("60/hour")
async def refresh(request: Request, req: RefreshRequest):
    """Refresh auth session using Supabase refresh token."""
    try:
        result = await asyncio.to_thread(refresh_session, req.refresh_token)
        user = result.get("user") or {}
        return RefreshResponse(
            access_token=result["access_token"],
            refresh_token=result.get("refresh_token", ""),
            token_type=result.get("token_type", "bearer"),
            expires_in=result.get("expires_in", 0),
            user=LoginUser(user_id=user.get("id", ""), email=user.get("email", "")),
        )
    except SupabaseServiceError as e:
        _raise_auth_error(e, "Refresh session gagal. Silakan login ulang.")


@router.post("/auth/logout", response_model=LogoutResponse)
@limiter.limit("120/hour")
async def logout(request: Request, access_token: str = Depends(verify_bearer_token)):
    """Logout current auth session."""
    try:
        await asyncio.to_thread(logout_session, access_token)
        return LogoutResponse(success=True, message="Logout berhasil.")
    except SupabaseServiceError as e:
        _raise_auth_error(e, "Logout gagal. Silakan coba lagi.")


@router.get("/auth/me", response_model=AuthMeResponse)
@limiter.limit("120/minute")
async def me(request: Request, access_token: str = Depends(verify_bearer_token)):
    """Return authenticated user profile + quota from Supabase."""
    try:
        auth_user = await asyncio.to_thread(get_auth_user, access_token)
        user_meta = auth_user.get("user_metadata") or {}
        user_id = auth_user["id"]
        email = auth_user.get("email", "")
        name = user_meta.get("name") or auth_user.get("email", "").split("@")[0] or "Pengguna"
        account_type, plan = resolve_account_plan_from_user_meta(user_meta)

        await asyncio.to_thread(
            upsert_user_profile_and_quota,
            user_id,
            email,
            name,
            plan,
            account_type,
        )
        profile = await asyncio.to_thread(get_user_profile_and_quota, user_id)
        return AuthMeResponse(**profile)
    except SupabaseServiceError as e:
        _raise_auth_error(e, "Gagal mengambil profil pengguna.")
