"""Mayar payment integration for plan upgrades."""
from __future__ import annotations

import json
import logging
import uuid
import base64
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from api.config import settings
from api.services.supabase_auth import SupabaseServiceError, set_user_account_plan

logger = logging.getLogger(__name__)


MAYAR_PROVIDER = "mayar"
PAYABLE_PLAN_PRICES: dict[str, dict[str, int]] = {
    "personal": {
        "starter": 29_000,
    },
    "business": {
        "plus": 499_000,
        "business": 1_500_000,
    },
}
PLAN_LABELS: dict[str, str] = {
    "starter": "Starter",
    "plus": "Plus",
    "business": "Bisnis",
}
SUPPORTED_WEBHOOK_EVENTS = {"payment.received", "payment.reminder"}
TEST_WEBHOOK_EVENTS = {"testing", "test", "webhook.testing"}
PAID_TRANSACTION_STATUSES = {"paid", "success", "succeeded", "completed", "settlement", "settled"}
FAILED_TRANSACTION_STATUSES = {"expired", "failed", "cancelled", "canceled"}


def _db_connect():
    if not settings.supabase_db_url:
        raise SupabaseServiceError(status_code=503, detail="Supabase Postgres belum dikonfigurasi.")
    return psycopg.connect(settings.supabase_db_url, row_factory=dict_row)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _mayar_timeout_seconds() -> int:
    return 30


def _require_mayar_api_key() -> str:
    key = settings.mayar_api_key.strip()
    if not key:
        raise SupabaseServiceError(status_code=503, detail="MAYAR_API_KEY belum dikonfigurasi.")
    return key


def _mayar_invoice_create_url() -> str:
    return f"{settings.mayar_api_base_url.rstrip('/')}/hl/v1/invoice/create"


def _parse_mayar_expired_at(value: object) -> datetime | None:
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value) / 1000.0, tz=timezone.utc)
        except (ValueError, OSError):
            return None
    if isinstance(value, str):
        normalized = value.strip().replace("Z", "+00:00")
        if not normalized:
            return None
        try:
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def _normalize_mobile(raw_mobile: str | None) -> str:
    digits = "".join(ch for ch in (raw_mobile or "") if ch.isdigit())
    if len(digits) >= 8:
        if digits.startswith("62"):
            return f"0{digits[2:]}" if len(digits) > 2 else "081234567890"
        return digits
    return "081234567890"


def _resolve_target_plan_price(account_type: str, target_plan: str) -> int:
    account_prices = PAYABLE_PLAN_PRICES.get(account_type)
    if not account_prices or target_plan not in account_prices:
        raise SupabaseServiceError(
            status_code=422,
            detail="Plan target tidak tersedia untuk tipe akun Anda.",
        )
    return account_prices[target_plan]


def _build_success_redirect_url(payment_id: str, source: str | None = None) -> str:
    base = (settings.app_base_url or "https://tanyahukum.dev").rstrip("/")
    checkout_url = f"{base}/checkout/"
    split = urlsplit(checkout_url)
    params = dict(parse_qsl(split.query, keep_blank_values=True))
    params["payment_ref"] = payment_id
    if source:
        params["source"] = source
    return urlunsplit((split.scheme, split.netloc, split.path, urlencode(params), split.fragment))


def _extract_response_data(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    data = payload.get("data")
    if isinstance(data, list):
        if not data:
            return {}
        first = data[0]
        return first if isinstance(first, dict) else {}
    if isinstance(data, dict):
        return data
    return {}


def _extract_error_detail(response: httpx.Response, fallback: str) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            return (
                payload.get("messages")
                or payload.get("message")
                or payload.get("error")
                or payload.get("detail")
                or fallback
            )
    except ValueError:
        pass
    text = response.text.strip()
    return text or fallback


def _extract_checkout_slug_from_api_key(api_key: str | None) -> str | None:
    raw = (api_key or "").strip()
    if not raw:
        return None
    parts = raw.split(".")
    if len(parts) != 3:
        return None
    payload_b64 = parts[1].strip()
    if not payload_b64:
        return None
    padding = "=" * (-len(payload_b64) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload_b64 + padding).decode("utf-8")
        payload = json.loads(decoded)
        if not isinstance(payload, dict):
            return None
        slug = str(payload.get("link") or "").strip().lower()
        return slug or None
    except Exception:
        return None


def _checkout_url_matches_slug(checkout_url: str | None, expected_slug: str | None) -> bool:
    if not expected_slug:
        return True
    if not checkout_url:
        return False
    host = urlsplit(checkout_url).netloc.lower()
    return expected_slug in host


def _get_existing_pending_payment(user_id: str, target_plan: str, expected_slug: str | None) -> dict | None:
    with _db_connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                id,
                account_type,
                current_plan,
                target_plan,
                amount,
                currency,
                status,
                checkout_url,
                expires_at,
                created_at,
                updated_at,
                paid_at
            FROM public.payment_transactions
            WHERE user_id = %s
              AND target_plan = %s
              AND status = 'pending'
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
            LIMIT 20;
            """,
            (user_id, target_plan),
        )
        rows = cur.fetchall()

    for row in rows:
        if not _checkout_url_matches_slug(row["checkout_url"], expected_slug):
            continue
        return {
            "payment_id": row["id"],
            "provider": MAYAR_PROVIDER,
            "account_type": row["account_type"],
            "current_plan": row["current_plan"],
            "target_plan": row["target_plan"],
            "amount": int(row["amount"]),
            "currency": row["currency"],
            "status": row["status"],
            "checkout_url": row["checkout_url"],
            "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            "paid_at": row["paid_at"].isoformat() if row["paid_at"] else None,
            "message": "Gunakan link pembayaran yang masih aktif.",
        }
    return None


def create_mayar_checkout(
    user_id: str,
    customer_name: str,
    customer_email: str,
    customer_mobile: str | None,
    account_type: str,
    current_plan: str | None,
    target_plan: str,
    source: str | None = None,
) -> dict:
    normalized_account_type = (account_type or "").strip().lower()
    normalized_target_plan = (target_plan or "").strip().lower()
    normalized_current_plan = (current_plan or "").strip().lower() or None
    normalized_source = (source or "").strip().lower() or None
    expected_checkout_slug = _extract_checkout_slug_from_api_key(settings.mayar_api_key)

    if normalized_current_plan == normalized_target_plan:
        raise SupabaseServiceError(status_code=409, detail="Paket target sudah aktif pada akun Anda.")

    amount = _resolve_target_plan_price(normalized_account_type, normalized_target_plan)
    existing = _get_existing_pending_payment(user_id, normalized_target_plan, expected_checkout_slug)
    if existing and existing.get("checkout_url"):
        return existing

    payment_id = str(uuid.uuid4())
    created_now = _now_utc()
    expires_at = created_now + timedelta(hours=max(1, settings.mayar_checkout_expiry_hours))
    plan_label = PLAN_LABELS.get(normalized_target_plan, normalized_target_plan.title())
    checkout_desc = f"Upgrade paket TanyaHukum ke {plan_label} (ref {payment_id})"
    redirect_url = _build_success_redirect_url(payment_id, normalized_source)

    request_payload = {
        "name": customer_name.strip() or "Pengguna TanyaHukum",
        "email": customer_email.strip().lower(),
        "mobile": _normalize_mobile(customer_mobile),
        "redirectUrl": redirect_url,
        "description": checkout_desc,
        "expiredAt": expires_at.isoformat(),
        "items": [
            {
                "quantity": 1,
                "rate": amount,
                "description": f"Paket {plan_label} TanyaHukum",
            }
        ],
        "extraData": {
            "payment_id": payment_id,
            "user_id": user_id,
            "target_plan": normalized_target_plan,
            "account_type": normalized_account_type,
            "source": normalized_source or "checkout",
        },
    }

    with _db_connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.payment_transactions (
                id,
                user_id,
                provider,
                account_type,
                current_plan,
                target_plan,
                amount,
                currency,
                status,
                customer_email,
                customer_name,
                request_payload,
                expires_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, 'IDR', 'pending', %s, %s, %s, %s
            );
            """,
            (
                payment_id,
                user_id,
                MAYAR_PROVIDER,
                normalized_account_type,
                normalized_current_plan,
                normalized_target_plan,
                amount,
                customer_email.strip().lower(),
                customer_name.strip() or "Pengguna TanyaHukum",
                Json(request_payload),
                expires_at,
            ),
        )
        conn.commit()

    api_key = _require_mayar_api_key()
    mayar_response_payload: dict | str | None = None
    mayar_status_code = 0
    try:
        with httpx.Client(timeout=_mayar_timeout_seconds()) as client:
            response = client.post(
                _mayar_invoice_create_url(),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=request_payload,
            )
        mayar_status_code = response.status_code
        try:
            mayar_response_payload = response.json()
        except ValueError:
            mayar_response_payload = response.text

        if response.status_code >= 400:
            detail = _extract_error_detail(response, "Gagal membuat pembayaran ke Mayar.")
            with _db_connect() as conn, conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.payment_transactions
                    SET
                        status = 'failed',
                        response_payload = %s,
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (Json({"status_code": response.status_code, "detail": detail}), payment_id),
                )
                conn.commit()
            raise SupabaseServiceError(status_code=502, detail=detail)
    except httpx.RequestError as e:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.payment_transactions
                SET
                    status = 'failed',
                    response_payload = %s,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (Json({"status_code": 0, "detail": str(e)}), payment_id),
            )
            conn.commit()
        raise SupabaseServiceError(status_code=502, detail="Mayar tidak dapat dihubungi saat membuat pembayaran.")

    data = _extract_response_data(mayar_response_payload)
    checkout_url = data.get("link") if isinstance(data, dict) else None
    provider_invoice_id = data.get("id") if isinstance(data, dict) else None
    provider_transaction_id = data.get("transactionId") if isinstance(data, dict) else None
    mayar_expired_at = _parse_mayar_expired_at(data.get("expiredAt")) if isinstance(data, dict) else None

    if not checkout_url:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.payment_transactions
                SET
                    status = 'failed',
                    response_payload = %s,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (
                    Json(
                        {
                            "status_code": mayar_status_code,
                            "payload": mayar_response_payload,
                            "detail": "Mayar tidak mengembalikan checkout link.",
                        }
                    ),
                    payment_id,
                ),
            )
            conn.commit()
        raise SupabaseServiceError(status_code=502, detail="Mayar tidak mengembalikan link pembayaran.")

    final_expiry = mayar_expired_at or expires_at
    updated_now = _now_utc()
    with _db_connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE public.payment_transactions
            SET
                provider_invoice_id = %s,
                provider_transaction_id = %s,
                checkout_url = %s,
                response_payload = %s,
                expires_at = %s,
                updated_at = NOW()
            WHERE id = %s;
            """,
            (
                provider_invoice_id,
                provider_transaction_id,
                checkout_url,
                Json(
                    {
                        "status_code": mayar_status_code,
                        "payload": mayar_response_payload,
                    }
                ),
                final_expiry,
                payment_id,
            ),
        )
        conn.commit()

    return {
        "payment_id": payment_id,
        "provider": MAYAR_PROVIDER,
        "account_type": normalized_account_type,
        "current_plan": normalized_current_plan,
        "target_plan": normalized_target_plan,
        "amount": amount,
        "currency": "IDR",
        "status": "pending",
        "checkout_url": checkout_url,
        "expires_at": final_expiry.isoformat(),
        "created_at": created_now.isoformat(),
        "updated_at": updated_now.isoformat(),
        "paid_at": None,
        "message": "Link pembayaran berhasil dibuat.",
    }


def get_user_payment(payment_id: str, user_id: str) -> dict:
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    provider,
                    account_type,
                    current_plan,
                    target_plan,
                    amount,
                    currency,
                    status,
                    checkout_url,
                    expires_at,
                    created_at,
                    updated_at,
                    paid_at
                FROM public.payment_transactions
                WHERE id = %s AND user_id = %s
                LIMIT 1;
                """,
                (payment_id, user_id),
            )
            row = cur.fetchone()
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengambil status pembayaran: {e}")

    if not row:
        raise SupabaseServiceError(status_code=404, detail="Pembayaran tidak ditemukan.")

    return {
        "payment_id": row["id"],
        "provider": row["provider"],
        "account_type": row["account_type"],
        "current_plan": row["current_plan"],
        "target_plan": row["target_plan"],
        "amount": int(row["amount"]),
        "currency": row["currency"],
        "status": row["status"],
        "checkout_url": row["checkout_url"],
        "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        "paid_at": row["paid_at"].isoformat() if row["paid_at"] else None,
    }


def validate_mayar_webhook_token(header_token: str | None, query_token: str | None) -> None:
    expected = settings.mayar_webhook_token.strip()
    if not expected:
        return
    incoming = (header_token or "").strip()
    query = (query_token or "").strip()
    if incoming != expected and query != expected:
        raise SupabaseServiceError(status_code=401, detail="Token webhook Mayar tidak valid.")


def _normalize_webhook_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise SupabaseServiceError(status_code=422, detail="Payload webhook tidak valid.")

    if isinstance(payload.get("payload"), str):
        try:
            parsed = json.loads(payload["payload"])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    return payload


def _parse_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        try:
            return int(cleaned)
        except ValueError:
            return None
    return None


def _normalize_transaction_status(value: str) -> str:
    status = (value or "").strip().lower()
    if status in PAID_TRANSACTION_STATUSES:
        return "paid"
    if status in FAILED_TRANSACTION_STATUSES:
        if status == "canceled":
            return "cancelled"
        return status
    return status


def process_mayar_webhook(payload: object) -> dict:
    parsed = _normalize_webhook_payload(payload)
    event = str(parsed.get("event") or parsed.get("type") or parsed.get("eventName") or "").strip().lower()
    if not event:
        raise SupabaseServiceError(status_code=422, detail="Event webhook tidak ditemukan.")

    if event in TEST_WEBHOOK_EVENTS:
        return {
            "success": True,
            "handled": True,
            "event": event,
            "payment_id": None,
            "message": "Webhook test Mayar diterima.",
        }

    data = parsed.get("data")
    if not isinstance(data, dict):
        data = parsed if isinstance(parsed, dict) else {}

    transaction_id = (
        str(data.get("transactionId") or data.get("paymentLinkTransactionId") or data.get("id") or "")
        .strip()
    )
    customer_email = str(data.get("customerEmail") or "").strip().lower()
    amount = _parse_int(data.get("amount"))
    transaction_status = _normalize_transaction_status(
        str(data.get("transactionStatus") or data.get("status") or parsed.get("transactionStatus") or "")
    )

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            row = None

            if transaction_id:
                cur.execute(
                    """
                    SELECT *
                    FROM public.payment_transactions
                    WHERE provider = 'mayar' AND provider_transaction_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1;
                    """,
                    (transaction_id,),
                )
                row = cur.fetchone()

            if not row and customer_email and amount is not None:
                cur.execute(
                    """
                    SELECT *
                    FROM public.payment_transactions
                    WHERE provider = 'mayar'
                      AND customer_email = %s
                      AND amount = %s
                      AND status IN ('pending', 'failed')
                    ORDER BY created_at DESC
                    LIMIT 1;
                    """,
                    (customer_email, amount),
                )
                row = cur.fetchone()

            if not row:
                return {
                    "success": True,
                    "handled": False,
                    "event": event,
                    "payment_id": None,
                    "message": "Webhook diterima, tetapi tidak ada transaksi lokal yang cocok.",
                }

            payment_id = row["id"]
            existing_payload = row["webhook_payload"] if isinstance(row["webhook_payload"], dict) else {}
            updated_payload = {
                **existing_payload,
                "last_event": event,
                "last_payload": parsed,
                "last_received_at": _now_utc().isoformat(),
            }

            cur.execute(
                """
                UPDATE public.payment_transactions
                SET
                    webhook_payload = %s,
                    provider_transaction_id = COALESCE(provider_transaction_id, %s),
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (Json(updated_payload), transaction_id or None, payment_id),
            )

            should_mark_paid = event == "payment.received" or transaction_status == "paid"
            if should_mark_paid and row["status"] != "paid":
                set_user_account_plan(
                    user_id=str(row["user_id"]),
                    account_type=row["account_type"],
                    plan=row["target_plan"],
                )
                cur.execute(
                    """
                    UPDATE public.payment_transactions
                    SET
                        status = 'paid',
                        paid_at = NOW(),
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (payment_id,),
                )
                conn.commit()
                return {
                    "success": True,
                    "handled": True,
                    "event": event,
                    "payment_id": payment_id,
                    "message": "Pembayaran berhasil dikonfirmasi dan paket diaktifkan.",
                }

            if transaction_status in {"expired", "failed", "cancelled"}:
                cur.execute(
                    """
                    UPDATE public.payment_transactions
                    SET
                        status = %s,
                        updated_at = NOW()
                    WHERE id = %s AND status = 'pending';
                    """,
                    (transaction_status, payment_id),
                )

            conn.commit()
            return {
                "success": True,
                "handled": True,
                "event": event,
                "payment_id": payment_id,
                "message": "Webhook diproses.",
            }
    except SupabaseServiceError:
        raise
    except Exception as e:
        logger.error(f"Gagal memproses webhook Mayar: {e}", exc_info=True)
        raise SupabaseServiceError(status_code=500, detail="Gagal memproses webhook Mayar.")
