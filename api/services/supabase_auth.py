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


ACCOUNT_PLAN_QUOTAS: dict[str, dict[str, dict[str, int | None]]] = {
    "personal": {
        "free": {"analysis_limit": 3, "esign_limit": 50, "chat_per_doc_limit": 10},
        "starter": {"analysis_limit": 10, "esign_limit": None, "chat_per_doc_limit": 20},
    },
    "business": {
        "plus": {"analysis_limit": 250, "esign_limit": None, "chat_per_doc_limit": 50},
        "business": {"analysis_limit": 1000, "esign_limit": None, "chat_per_doc_limit": 50},
        "enterprise": {"analysis_limit": None, "esign_limit": None, "chat_per_doc_limit": 50},
    },
}

LEGACY_PLAN_ALIASES: dict[str, tuple[str, str]] = {
    "b2b_starter": ("business", "plus"),
    "b2b_business": ("business", "business"),
    "b2b_enterprise": ("business", "enterprise"),
}

BUSINESS_UNASSIGNED_QUOTAS: dict[str, int | None] = {
    "analysis_limit": ACCOUNT_PLAN_QUOTAS["personal"]["free"]["analysis_limit"],
    "esign_limit": ACCOUNT_PLAN_QUOTAS["personal"]["free"]["esign_limit"],
    "chat_per_doc_limit": ACCOUNT_PLAN_QUOTAS["personal"]["free"]["chat_per_doc_limit"],
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
    """Ensure required v2.0-A and v2.0-B/C tables exist in Supabase Postgres."""
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
                account_type TEXT NOT NULL DEFAULT 'personal',
                plan TEXT NULL,
                company_name TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )
        cur.execute("ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS account_type TEXT;")
        cur.execute("ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS billing_email TEXT;")
        cur.execute("ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS billing_mobile TEXT;")
        cur.execute("ALTER TABLE public.user_profiles ALTER COLUMN plan DROP NOT NULL;")
        cur.execute("ALTER TABLE public.user_profiles ALTER COLUMN plan DROP DEFAULT;")
        cur.execute(
            """
            UPDATE public.user_profiles
            SET
                billing_email = CASE
                    WHEN trim(COALESCE(billing_email, '')) = '' THEN lower(email)
                    ELSE lower(billing_email)
                END,
                billing_mobile = CASE
                    WHEN trim(COALESCE(billing_mobile, '')) = '' THEN NULLIF(trim(COALESCE(phone, '')), '')
                    ELSE trim(billing_mobile)
                END;
            """
        )
        cur.execute(
            """
            UPDATE public.user_profiles
            SET plan = CASE
                WHEN lower(COALESCE(plan, '')) = 'b2b_starter' THEN 'plus'
                WHEN lower(COALESCE(plan, '')) = 'b2b_business' THEN 'business'
                WHEN lower(COALESCE(plan, '')) = 'b2b_enterprise' THEN 'enterprise'
                WHEN lower(COALESCE(plan, '')) IN ('free', 'starter', 'plus', 'business', 'enterprise') THEN lower(plan)
                WHEN trim(COALESCE(plan, '')) = '' THEN NULL
                ELSE 'free'
            END;
            """
        )
        cur.execute(
            """
            UPDATE public.user_profiles
            SET account_type = CASE
                WHEN lower(COALESCE(account_type, '')) IN ('personal', 'business') THEN lower(account_type)
                WHEN plan IN ('plus', 'business', 'enterprise') THEN 'business'
                ELSE 'personal'
            END;
            """
        )
        cur.execute("ALTER TABLE public.user_profiles ALTER COLUMN account_type SET DEFAULT 'personal';")
        cur.execute("UPDATE public.user_profiles SET account_type = 'personal' WHERE account_type IS NULL;")
        cur.execute("ALTER TABLE public.user_profiles ALTER COLUMN account_type SET NOT NULL;")
        cur.execute(
            """
            UPDATE public.user_profiles
            SET
                account_type = CASE
                    WHEN plan IN ('plus', 'business', 'enterprise') THEN 'business'
                    ELSE account_type
                END,
                plan = CASE
                    WHEN account_type = 'personal' AND plan IS NULL THEN 'free'
                    WHEN account_type = 'business' AND plan IN ('free', 'starter') THEN NULL
                    ELSE plan
                END;
            """
        )
        cur.execute("ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_account_type_check;")
        cur.execute("ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_plan_check;")
        cur.execute("ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_account_plan_check;")
        cur.execute(
            """
            ALTER TABLE public.user_profiles
            ADD CONSTRAINT user_profiles_account_type_check
            CHECK (account_type IN ('personal', 'business'));
            """
        )
        cur.execute(
            """
            ALTER TABLE public.user_profiles
            ADD CONSTRAINT user_profiles_plan_check
            CHECK (plan IS NULL OR plan IN ('free', 'starter', 'plus', 'business', 'enterprise'));
            """
        )
        cur.execute(
            """
            ALTER TABLE public.user_profiles
            ADD CONSTRAINT user_profiles_account_plan_check
            CHECK (
                (account_type = 'personal' AND plan IN ('free', 'starter'))
                OR
                (account_type = 'business' AND (plan IS NULL OR plan IN ('plus', 'business', 'enterprise')))
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
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.documents (
                id TEXT PRIMARY KEY,
                owner_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
                analysis_id TEXT NULL,
                filename TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending_signatures',
                company_pays_analysis BOOLEAN NOT NULL DEFAULT FALSE,
                expires_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT documents_status_check CHECK (
                    status IN ('draft', 'analyzed', 'pending_signatures', 'partially_signed', 'completed', 'expired', 'rejected')
                )
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.document_signers (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
                email TEXT NOT NULL,
                name TEXT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                signed_at TIMESTAMPTZ NULL,
                signature_id TEXT NULL,
                rejection_reason TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT document_signers_role_check CHECK (role IN ('sender', 'recipient')),
                CONSTRAINT document_signers_status_check CHECK (status IN ('pending', 'signed', 'rejected')),
                CONSTRAINT document_signers_unique_email_per_doc UNIQUE (document_id, email)
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.signatures (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
                signer_email TEXT NOT NULL,
                signer_name TEXT NOT NULL,
                ip_address TEXT NULL,
                user_agent TEXT NULL,
                consent_text TEXT NOT NULL,
                document_hash TEXT NOT NULL,
                signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT signatures_unique_per_doc_signer UNIQUE (document_id, signer_email)
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.document_pdf_versions (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
                version_no INTEGER NOT NULL,
                version_type TEXT NOT NULL,
                pdf_bytes BYTEA NOT NULL,
                created_by_user_id UUID NULL REFERENCES public.user_profiles(user_id) ON DELETE SET NULL,
                created_by_email TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT document_pdf_versions_type_check CHECK (
                    version_type IN ('original', 'signed_visual', 'signed_final')
                ),
                CONSTRAINT document_pdf_versions_unique_version UNIQUE (document_id, version_no)
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.document_events (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
                actor_user_id UUID NULL,
                actor_email TEXT NULL,
                event_type TEXT NOT NULL,
                request_id TEXT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT document_events_type_check CHECK (
                    event_type IN ('shared', 'signed', 'rejected', 'status_changed', 'certificate_viewed')
                )
            );
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS public.payment_transactions (
                id TEXT PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES public.user_profiles(user_id) ON DELETE CASCADE,
                provider TEXT NOT NULL DEFAULT 'mayar',
                account_type TEXT NOT NULL,
                current_plan TEXT NULL,
                target_plan TEXT NOT NULL,
                amount INTEGER NOT NULL,
                currency TEXT NOT NULL DEFAULT 'IDR',
                status TEXT NOT NULL DEFAULT 'pending',
                customer_email TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                provider_invoice_id TEXT NULL,
                provider_transaction_id TEXT NULL,
                checkout_url TEXT NULL,
                request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                webhook_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                expires_at TIMESTAMPTZ NULL,
                paid_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT payment_transactions_status_check CHECK (
                    status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')
                ),
                CONSTRAINT payment_transactions_provider_check CHECK (
                    provider IN ('mayar')
                ),
                CONSTRAINT payment_transactions_account_type_check CHECK (
                    account_type IN ('personal', 'business')
                ),
                CONSTRAINT payment_transactions_target_plan_check CHECK (
                    target_plan IN ('starter', 'plus', 'business')
                )
            );
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON public.documents(owner_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_document_signers_document_id ON public.document_signers(document_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_document_pdf_versions_document_id_version_no ON public.document_pdf_versions(document_id, version_no DESC);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_document_events_document_id_created_at ON public.document_events(document_id, created_at DESC);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id_created_at ON public.payment_transactions(user_id, created_at DESC);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider_tx ON public.payment_transactions(provider_transaction_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);")
        conn.commit()
    return True


def _normalize_account_and_plan(
    account_type: str | None,
    plan: str | None,
    strict: bool = False,
) -> tuple[str, str | None]:
    raw_account_type = (account_type or "").strip().lower()
    raw_plan = (plan or "").strip().lower() or None

    if raw_plan in LEGACY_PLAN_ALIASES:
        return LEGACY_PLAN_ALIASES[raw_plan]

    if raw_account_type == "business":
        if raw_plan and raw_plan in ACCOUNT_PLAN_QUOTAS["business"]:
            return "business", raw_plan
        if strict and raw_plan:
            raise SupabaseServiceError(
                status_code=422,
                detail="Plan untuk account_type business harus plus, business, atau enterprise.",
            )
        return "business", None

    if raw_account_type == "personal":
        if raw_plan and raw_plan in ACCOUNT_PLAN_QUOTAS["personal"]:
            return "personal", raw_plan
        if strict and raw_plan:
            raise SupabaseServiceError(
                status_code=422,
                detail="Plan untuk account_type personal harus free atau starter.",
            )
        return "personal", "free"

    if raw_plan and raw_plan in ACCOUNT_PLAN_QUOTAS["business"]:
        return "business", raw_plan
    if raw_plan and raw_plan in ACCOUNT_PLAN_QUOTAS["personal"]:
        return "personal", raw_plan

    return "personal", "free"


def _resolve_quota_defaults(account_type: str, plan: str | None) -> dict[str, int | None]:
    if account_type == "business" and plan is None:
        return BUSINESS_UNASSIGNED_QUOTAS
    return ACCOUNT_PLAN_QUOTAS[account_type][plan]


def resolve_account_plan_from_user_meta(user_meta: dict | None) -> tuple[str, str | None]:
    meta = user_meta or {}
    account_type = meta.get("account_type")
    raw_plan = meta.get("plan")
    plan = raw_plan if isinstance(raw_plan, str) else None
    return _normalize_account_and_plan(account_type, plan)


def _quota_remaining(limit: int | None, used: int) -> int | None:
    if limit is None:
        return None
    return max(0, limit - used)


def upsert_user_profile_and_quota(
    user_id: str,
    email: str,
    name: str,
    plan: str | None = None,
    account_type: str | None = None,
) -> None:
    """Upsert app profile + default quotas for a Supabase Auth user."""
    normalized_account_type, normalized_plan = _normalize_account_and_plan(account_type, plan)
    defaults = _resolve_quota_defaults(normalized_account_type, normalized_plan)

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.user_profiles (user_id, email, name, account_type, plan)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE
                SET
                    email = EXCLUDED.email,
                    name = EXCLUDED.name,
                    account_type = EXCLUDED.account_type,
                    plan = EXCLUDED.plan,
                    updated_at = NOW();
                """,
                (user_id, email, name.strip(), normalized_account_type, normalized_plan),
            )
            cur.execute(
                """
                INSERT INTO public.user_quotas (
                    user_id, analysis_used, analysis_limit, esign_used, esign_limit, chat_per_doc_limit, reset_at
                )
                VALUES (%s, 0, %s, 0, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE
                SET
                    analysis_limit = EXCLUDED.analysis_limit,
                    esign_limit = EXCLUDED.esign_limit,
                    chat_per_doc_limit = EXCLUDED.chat_per_doc_limit,
                    updated_at = NOW();
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
                    p.billing_email,
                    p.billing_mobile,
                    p.account_type,
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
        "billing_email": row["billing_email"] or row["email"],
        "billing_mobile": row["billing_mobile"] or row["phone"],
        "account_type": row["account_type"],
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


def update_user_billing_profile(
    user_id: str,
    billing_email: str,
    billing_mobile: str | None,
) -> dict:
    """Update billing contact defaults for checkout and return the latest profile."""
    normalized_email = billing_email.strip().lower()
    normalized_mobile = billing_mobile.strip() if billing_mobile else None

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.user_profiles
                SET
                    billing_email = %s,
                    billing_mobile = %s,
                    updated_at = NOW()
                WHERE user_id = %s
                RETURNING user_id;
                """,
                (normalized_email, normalized_mobile, user_id),
            )
            row = cur.fetchone()
            if not row:
                raise SupabaseServiceError(status_code=404, detail="Profil pengguna tidak ditemukan.")
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menyimpan kontak billing: {e}")

    return get_user_profile_and_quota(user_id)


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


def refund_analysis_quota(user_id: str) -> None:
    """Atomically refund 1 analysis quota for a user (on failure)."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.user_quotas
                SET
                    analysis_used = GREATEST(0, analysis_used - 1),
                    updated_at = NOW()
                WHERE user_id = %s;
                """,
                (user_id,),
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to refund analysis quota: {e}")


def consume_esign_quota(user_id: str) -> dict[str, int | None]:
    """Atomically consume 1 e-sign quota for a user."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            _reset_quotas_if_due(cur, user_id)
            cur.execute(
                """
                UPDATE public.user_quotas
                SET
                    esign_used = esign_used + 1,
                    updated_at = NOW()
                WHERE user_id = %s
                  AND (esign_limit IS NULL OR esign_used < esign_limit)
                RETURNING esign_used, esign_limit;
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "SELECT esign_used, esign_limit FROM public.user_quotas WHERE user_id = %s LIMIT 1;",
                    (user_id,),
                )
                current = cur.fetchone()
                if not current:
                    raise SupabaseServiceError(status_code=404, detail="Data quota e-sign pengguna tidak ditemukan.")
                raise SupabaseServiceError(status_code=403, detail="Kuota e-sign Anda sudah habis.")
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengurangi quota e-sign: {e}")

    used = row["esign_used"]
    limit = row["esign_limit"]
    return {
        "esign_used": used,
        "esign_limit": limit,
        "esign_remaining": _quota_remaining(limit, used),
    }


def register_user(
    email: str,
    password: str,
    name: str,
    plan: str | None = None,
    account_type: str | None = None,
) -> dict:
    """Create user in Supabase Auth, then upsert profile/quota in Postgres.

    Uses admin create-user when service key is available so prototype can
    authenticate immediately without email confirmation flow.
    """
    normalized_account_type, normalized_plan = _normalize_account_and_plan(account_type, plan, strict=True)
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
                    "user_metadata": {
                        "name": name,
                        "account_type": normalized_account_type,
                        "plan": normalized_plan,
                    },
                },
            )
            if response.status_code >= 400:
                raise SupabaseServiceError(response.status_code, _extract_supabase_error(response))
            payload = response.json()
        else:
            response = client.post(
                f"{settings.supabase_url}/auth/v1/signup",
                headers=_auth_headers(),
                json={
                    "email": email,
                    "password": password,
                    "data": {
                        "name": name,
                        "account_type": normalized_account_type,
                        "plan": normalized_plan,
                    },
                },
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
        account_type=normalized_account_type,
    )

    return {
        "user_id": user["id"],
        "email": user.get("email", email),
        "email_confirmed": bool(user.get("email_confirmed_at")),
        "account_type": normalized_account_type,
        "plan": normalized_plan,
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


def refresh_session(refresh_token: str) -> dict:
    """Refresh access token using Supabase refresh token."""
    headers = _auth_headers()
    url = f"{settings.supabase_url}/auth/v1/token?grant_type=refresh_token"

    with httpx.Client(timeout=20.0) as client:
        response = client.post(url, headers=headers, json={"refresh_token": refresh_token})

    if response.status_code >= 400:
        raise SupabaseServiceError(response.status_code, _extract_supabase_error(response))

    payload = response.json()
    if not payload.get("access_token"):
        raise SupabaseServiceError(status_code=502, detail="Token refresh tidak ditemukan.")
    return payload


def logout_session(access_token: str) -> None:
    """Invalidate Supabase session for current access token."""
    headers = _auth_headers(token=access_token)
    url = f"{settings.supabase_url}/auth/v1/logout"

    with httpx.Client(timeout=20.0) as client:
        response = client.post(url, headers=headers)

    if response.status_code >= 400:
        raise SupabaseServiceError(response.status_code, _extract_supabase_error(response))


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


def set_user_account_plan(
    user_id: str,
    account_type: str,
    plan: str | None,
) -> dict:
    """Persist paid plan changes to Supabase Auth metadata and app profile/quota."""
    normalized_account_type, normalized_plan = _normalize_account_and_plan(
        account_type,
        plan,
        strict=True,
    )

    if normalized_plan is None:
        raise SupabaseServiceError(
            status_code=422,
            detail="Plan target harus terdefinisi untuk upgrade paket berbayar.",
        )

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT email, name FROM public.user_profiles WHERE user_id = %s LIMIT 1;",
                (user_id,),
            )
            row = cur.fetchone()
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal membaca profil user untuk update plan: {e}")

    if not row:
        raise SupabaseServiceError(status_code=404, detail="Profil pengguna tidak ditemukan.")

    admin_headers = _service_headers()
    admin_user_url = f"{settings.supabase_url}/auth/v1/admin/users/{user_id}"

    with httpx.Client(timeout=20.0) as client:
        get_resp = client.get(admin_user_url, headers=admin_headers)
        if get_resp.status_code >= 400:
            raise SupabaseServiceError(get_resp.status_code, _extract_supabase_error(get_resp))

        raw = get_resp.json()
        auth_user = raw.get("user") if isinstance(raw, dict) and raw.get("user") else raw
        user_meta = auth_user.get("user_metadata") if isinstance(auth_user, dict) else {}
        if not isinstance(user_meta, dict):
            user_meta = {}

        user_meta.update(
            {
                "account_type": normalized_account_type,
                "plan": normalized_plan,
            }
        )

        patch_resp = client.put(
            admin_user_url,
            headers=admin_headers,
            json={"user_metadata": user_meta},
        )
        if patch_resp.status_code >= 400:
            raise SupabaseServiceError(patch_resp.status_code, _extract_supabase_error(patch_resp))

    upsert_user_profile_and_quota(
        user_id=user_id,
        email=row["email"],
        name=row["name"],
        plan=normalized_plan,
        account_type=normalized_account_type,
    )

    return {
        "user_id": user_id,
        "account_type": normalized_account_type,
        "plan": normalized_plan,
    }
