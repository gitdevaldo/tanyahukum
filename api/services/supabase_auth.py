"""Supabase Auth + Postgres helpers for v2.0-A (accounts and quota)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
import psycopg
from psycopg.rows import dict_row

from api.config import settings

logger = logging.getLogger(__name__)


class SupabaseServiceError(Exception):
    """Raised when Supabase auth/db operations fail."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


PLAN_QUOTAS: dict[str, dict[str, int | None]] = {
    "free": {"analysis_limit": 3, "esign_limit": 50, "chat_per_doc_limit": 10},
    "starter": {"analysis_limit": 10, "esign_limit": None, "chat_per_doc_limit": 20},
    "plus": {"analysis_limit": 30, "esign_limit": None, "chat_per_doc_limit": 50},
    "b2b_starter": {"analysis_limit": 250, "esign_limit": None, "chat_per_doc_limit": 50},
    "b2b_business": {"analysis_limit": 1000, "esign_limit": None, "chat_per_doc_limit": 50},
    "b2b_enterprise": {"analysis_limit": None, "esign_limit": None, "chat_per_doc_limit": 50},
}


def _next_month_reset_at_iso() -> str:
    now = datetime.now(timezone.utc)
    if now.month == 12:
        reset = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        reset = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return reset.isoformat()


def _auth_headers(token: str | None = None) -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise SupabaseServiceError(
            status_code=503,
            detail="Supabase Auth belum dikonfigurasi (SUPABASE_URL/SUPABASE_ANON_KEY).",
        )

    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {settings.supabase_anon_key}",
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _service_headers() -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise SupabaseServiceError(
            status_code=503,
            detail="Supabase service key belum dikonfigurasi.",
        )
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }


def _require_db_url() -> str:
    if not settings.supabase_db_url:
        raise SupabaseServiceError(
            status_code=503,
            detail="Supabase Postgres belum dikonfigurasi (SUPABASE_DB_URL).",
        )
    return settings.supabase_db_url


def _extract_supabase_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
        return (
            payload.get("msg")
            or payload.get("error_description")
            or payload.get("error")
            or payload.get("message")
            or "Permintaan Supabase gagal."
        )
    except ValueError:
        return response.text or "Permintaan Supabase gagal."


def _db_connect():
    return psycopg.connect(_require_db_url(), row_factory=dict_row)


def ensure_supabase_schema() -> bool:
    """Ensure required v2.0-A tables exist in Supabase Postgres."""
    if not settings.supabase_db_url:
        logger.warning("SUPABASE_DB_URL not set — skipping schema bootstrap for v2.0-A")
        return False

    with _db_connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.user_profiles (
                user_id UUID PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                phone TEXT NULL,
                plan TEXT NOT NULL DEFAULT 'free',
                company_name TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.user_quotas (
                user_id UUID PRIMARY KEY REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
                analysis_used INTEGER NOT NULL DEFAULT 0,
                analysis_limit INTEGER NULL,
                esign_used INTEGER NOT NULL DEFAULT 0,
                esign_limit INTEGER NULL,
                chat_per_doc_limit INTEGER NOT NULL DEFAULT 10,
                reset_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        conn.commit()
    return True


def _normalize_plan(plan: str | None) -> str:
    normalized = (plan or "free").strip().lower()
    if normalized not in PLAN_QUOTAS:
        return "free"
    return normalized


def _quota_remaining(limit: int | None, used: int) -> int | None:
    if limit is None:
        return None
    return max(0, limit - used)


def upsert_user_profile_and_quota(user_id: str, email: str, name: str, plan: str = "free") -> None:
    """Upsert app profile + default quotas for a Supabase Auth user."""
    normalized_plan = _normalize_plan(plan)
    defaults = PLAN_QUOTAS[normalized_plan]

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.user_profiles (user_id, email, name, plan)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE
                SET
                    email = EXCLUDED.email,
                    name = EXCLUDED.name,
                    plan = EXCLUDED.plan,
                    updated_at = NOW();
                """,
                (user_id, email, name.strip(), normalized_plan),
            )
            cur.execute(
                """
                INSERT INTO public.user_quotas (
                    user_id, analysis_used, analysis_limit, esign_used, esign_limit, chat_per_doc_limit, reset_at
                )
                VALUES (%s, 0, %s, 0, %s, %s, %s)
                ON CONFLICT (user_id) DO NOTHING;
                """,
                (
                    user_id,
                    defaults["analysis_limit"],
                    defaults["esign_limit"],
                    defaults["chat_per_doc_limit"],
                    _next_month_reset_at_iso(),
                ),
            )
            conn.commit()
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menyimpan profil pengguna: {e}")


def get_user_profile_and_quota(user_id: str) -> dict:
    """Read user profile + quota from Supabase Postgres."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    p.user_id,
                    p.email,
                    p.name,
                    p.phone,
                    p.plan,
                    p.company_name,
                    p.created_at,
                    q.analysis_used,
                    q.analysis_limit,
                    q.esign_used,
                    q.esign_limit,
                    q.chat_per_doc_limit,
                    q.reset_at
                FROM public.user_profiles p
                JOIN public.user_quotas q ON q.user_id = p.user_id
                WHERE p.user_id = %s
                LIMIT 1;
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                raise SupabaseServiceError(status_code=404, detail="Profil pengguna tidak ditemukan.")
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal membaca profil pengguna: {e}")

    return {
        "user_id": str(row["user_id"]),
        "email": row["email"],
        "name": row["name"],
        "phone": row["phone"],
        "plan": row["plan"],
        "company_name": row["company_name"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "quota": {
            "analysis_used": row["analysis_used"],
            "analysis_limit": row["analysis_limit"],
            "analysis_remaining": _quota_remaining(row["analysis_limit"], row["analysis_used"]),
            "esign_used": row["esign_used"],
            "esign_limit": row["esign_limit"],
            "esign_remaining": _quota_remaining(row["esign_limit"], row["esign_used"]),
            "chat_per_doc_limit": row["chat_per_doc_limit"],
            "reset_at": row["reset_at"].isoformat() if row["reset_at"] else None,
        },
    }


def _reset_quotas_if_due(cur, user_id: str) -> None:
    cur.execute(
        """
        UPDATE public.user_quotas
        SET
            analysis_used = 0,
            esign_used = 0,
            reset_at = date_trunc('month', NOW()) + interval '1 month',
            updated_at = NOW()
        WHERE user_id = %s
          AND reset_at <= NOW();
        """,
        (user_id,),
    )


def consume_analysis_quota(user_id: str) -> dict[str, int | None]:
    """Atomically consume 1 analysis quota for a user."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            _reset_quotas_if_due(cur, user_id)
            cur.execute(
                """
                UPDATE public.user_quotas
                SET
                    analysis_used = analysis_used + 1,
                    updated_at = NOW()
                WHERE user_id = %s
                  AND (analysis_limit IS NULL OR analysis_used < analysis_limit)
                RETURNING analysis_used, analysis_limit;
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "SELECT analysis_used, analysis_limit FROM public.user_quotas WHERE user_id = %s LIMIT 1;",
                    (user_id,),
                )
                current = cur.fetchone()
                if not current:
                    raise SupabaseServiceError(status_code=404, detail="Data quota pengguna tidak ditemukan.")
                raise SupabaseServiceError(status_code=403, detail="Kuota analisis Anda sudah habis.")
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengurangi quota analisis: {e}")

    used = row["analysis_used"]
    limit = row["analysis_limit"]
    return {
        "analysis_used": used,
        "analysis_limit": limit,
        "analysis_remaining": _quota_remaining(limit, used),
    }


def register_user(email: str, password: str, name: str, plan: str = "free") -> dict:
    """Create user in Supabase Auth, then upsert profile/quota in Postgres.

    Uses admin create-user when service key is available so prototype can
    authenticate immediately without email confirmation flow.
    """
    normalized_plan = _normalize_plan(plan)
    payload: dict

    with httpx.Client(timeout=20.0) as client:
        if settings.supabase_service_role_key:
            response = client.post(
                f"{settings.supabase_url}/auth/v1/admin/users",
                headers=_service_headers(),
                json={
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"name": name, "plan": normalized_plan},
                },
            )
            if response.status_code >= 400:
                raise SupabaseServiceError(response.status_code, _extract_supabase_error(response))
            payload = response.json()
        else:
            response = client.post(
                f"{settings.supabase_url}/auth/v1/signup",
                headers=_auth_headers(),
                json={"email": email, "password": password, "data": {"name": name, "plan": normalized_plan}},
            )
            if response.status_code >= 400:
                raise SupabaseServiceError(response.status_code, _extract_supabase_error(response))
            payload = response.json()

    user = payload.get("user") if isinstance(payload, dict) else None
    if not user and isinstance(payload, dict) and payload.get("id"):
        user = payload
    if not user or not user.get("id"):
        raise SupabaseServiceError(status_code=502, detail="Respons registrasi Supabase tidak valid.")

    upsert_user_profile_and_quota(
        user_id=user["id"],
        email=user.get("email", email),
        name=name,
        plan=normalized_plan,
    )

    return {
        "user_id": user["id"],
        "email": user.get("email", email),
        "email_confirmed": bool(user.get("email_confirmed_at")),
    }


def login_user(email: str, password: str) -> dict:
    """Authenticate user against Supabase Auth password grant."""
    headers = _auth_headers()
    url = f"{settings.supabase_url}/auth/v1/token?grant_type=password"

    with httpx.Client(timeout=20.0) as client:
        response = client.post(url, headers=headers, json={"email": email, "password": password})

    if response.status_code >= 400:
        raise SupabaseServiceError(response.status_code, _extract_supabase_error(response))

    payload = response.json()
    if not payload.get("access_token"):
        raise SupabaseServiceError(status_code=502, detail="Token login tidak ditemukan.")

    return payload


def get_auth_user(access_token: str) -> dict:
    """Resolve current user from Supabase access token."""
    headers = _auth_headers(token=access_token)
    url = f"{settings.supabase_url}/auth/v1/user"

    with httpx.Client(timeout=20.0) as client:
        response = client.get(url, headers=headers)

    if response.status_code >= 400:
        raise SupabaseServiceError(response.status_code, _extract_supabase_error(response))

    payload = response.json()
    if not payload.get("id"):
        raise SupabaseServiceError(status_code=401, detail="Token pengguna tidak valid.")
    return payload
