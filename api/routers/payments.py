"""Payment endpoints for Mayar checkout integration."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.dependencies import verify_bearer_token
from api.models.schemas import (
    PaymentCheckoutRequest,
    PaymentCheckoutResponse,
    PaymentStatusResponse,
    PaymentWebhookResponse,
)
from api.services.supabase_auth import (
    SupabaseServiceError,
    get_auth_user,
    resolve_account_plan_from_user_meta,
    upsert_user_profile_and_quota,
    get_user_profile_and_quota,
)
from api.services.payments import (
    create_mayar_checkout,
    get_user_payment,
    process_mayar_webhook,
    validate_mayar_webhook_token,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _raise_payment_error(e: SupabaseServiceError, fallback: str) -> None:
    if e.status_code >= 500:
        raise HTTPException(status_code=500, detail=fallback)
    raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post("/payments/checkout", response_model=PaymentCheckoutResponse)
@limiter.limit("30/minute")
async def create_checkout(
    request: Request,
    req: PaymentCheckoutRequest,
    access_token: str = Depends(verify_bearer_token),
):
    """Create a Mayar checkout URL for upgrading account plan."""
    try:
        auth_user = await asyncio.to_thread(get_auth_user, access_token)
        user_meta = auth_user.get("user_metadata") or {}
        user_id = auth_user["id"]
        email = auth_user.get("email", "")
        name = user_meta.get("name") or email.split("@")[0] or "Pengguna"
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
        billing_name = (req.billing_name or profile["name"] or name or "Pengguna TanyaHukum").strip()
        billing_email = (
            str(req.billing_email)
            if req.billing_email
            else profile.get("billing_email") or profile["email"] or email
        ).strip().lower()
        billing_mobile = (req.billing_mobile or profile.get("billing_mobile") or profile.get("phone") or "").strip() or None

        result = await asyncio.to_thread(
            create_mayar_checkout,
            user_id,
            billing_name,
            billing_email,
            billing_mobile,
            profile["account_type"],
            profile["plan"],
            req.target_plan,
            req.source,
        )
        return PaymentCheckoutResponse(**result)
    except SupabaseServiceError as e:
        _raise_payment_error(e, "Gagal membuat link pembayaran.")


@router.get("/payments/{payment_id}", response_model=PaymentStatusResponse)
@limiter.limit("120/minute")
async def get_payment_status(
    request: Request,
    payment_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    """Get status for a user's own payment transaction."""
    try:
        auth_user = await asyncio.to_thread(get_auth_user, access_token)
        user_id = auth_user["id"]
        result = await asyncio.to_thread(get_user_payment, payment_id, user_id)
        return PaymentStatusResponse(**result)
    except SupabaseServiceError as e:
        _raise_payment_error(e, "Gagal mengambil status pembayaran.")


@router.post("/payments/mayar/webhook", response_model=PaymentWebhookResponse)
@limiter.limit("300/minute")
async def mayar_webhook(request: Request):
    """Receive payment status events from Mayar webhook."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Payload webhook tidak valid.")

    try:
        await asyncio.to_thread(
            validate_mayar_webhook_token,
            request.headers.get("X-Mayar-Webhook-Token"),
            request.query_params.get("token"),
        )
        result = await asyncio.to_thread(process_mayar_webhook, body)
        return PaymentWebhookResponse(**result)
    except SupabaseServiceError as e:
        _raise_payment_error(e, "Gagal memproses webhook pembayaran.")
