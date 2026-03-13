"""Document sharing and signing service (v2.0-B/C)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from api.config import settings
from api.services.supabase_auth import SupabaseServiceError


def _db_connect():
    if not settings.supabase_db_url:
        raise SupabaseServiceError(status_code=503, detail="Supabase Postgres belum dikonfigurasi.")
    return psycopg.connect(settings.supabase_db_url, row_factory=dict_row)


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        raise SupabaseServiceError(status_code=422, detail="Format expires_at tidak valid (gunakan ISO-8601).")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_document_share(
    owner_id: str,
    owner_email: str,
    owner_name: str,
    analysis_id: str | None,
    filename: str,
    signer_emails: list[str],
    company_pays_analysis: bool,
    expires_at: str | None,
) -> dict:
    owner_email = owner_email.strip().lower()
    recipient_emails: list[str] = []
    seen = {owner_email}
    for raw in signer_emails:
        email = raw.strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        recipient_emails.append(email)

    if not recipient_emails:
        raise SupabaseServiceError(status_code=422, detail="Minimal satu email penerima diperlukan.")

    expiry = _parse_iso_datetime(expires_at)
    if expiry and expiry <= _now_utc():
        raise SupabaseServiceError(status_code=422, detail="expires_at harus di masa depan.")

    document_id = str(uuid.uuid4())
    sender_signer_id = str(uuid.uuid4())

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.documents (
                    id, owner_id, analysis_id, filename, status, company_pays_analysis, expires_at
                ) VALUES (%s, %s, %s, %s, 'pending_signatures', %s, %s);
                """,
                (document_id, owner_id, analysis_id, filename, company_pays_analysis, expiry),
            )

            cur.execute(
                """
                INSERT INTO public.document_signers (id, document_id, email, name, role, status)
                VALUES (%s, %s, %s, %s, 'sender', 'pending');
                """,
                (sender_signer_id, document_id, owner_email, owner_name),
            )

            for email in recipient_emails:
                cur.execute(
                    """
                    INSERT INTO public.document_signers (id, document_id, email, name, role, status)
                    VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    (str(uuid.uuid4()), document_id, email, None, "recipient", "pending"),
                )

            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal membuat dokumen sharing: {e}")

    return {
        "document_id": document_id,
        "status": "pending_signatures",
        "signers_count": 1 + len(recipient_emails),
        "message": "Dokumen berhasil dibagikan untuk co-sign.",
    }


def _load_document_with_access(cur, document_id: str, user_id: str, email: str) -> dict:
    cur.execute(
        """
        SELECT d.*
        FROM public.documents d
        WHERE d.id = %s
          AND (
            d.owner_id = %s
            OR EXISTS (
              SELECT 1
              FROM public.document_signers s
              WHERE s.document_id = d.id AND lower(s.email) = lower(%s)
            )
          )
        LIMIT 1;
        """,
        (document_id, user_id, email),
    )
    doc = cur.fetchone()
    if not doc:
        raise SupabaseServiceError(status_code=404, detail="Dokumen tidak ditemukan.")
    return doc


def list_document_signers(document_id: str, user_id: str, email: str) -> dict:
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, user_id, email)
            cur.execute(
                """
                SELECT email, name, role, status, signed_at, rejection_reason
                FROM public.document_signers
                WHERE document_id = %s
                ORDER BY CASE role WHEN 'sender' THEN 0 ELSE 1 END, email;
                """,
                (document_id,),
            )
            signers = cur.fetchall()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengambil signer dokumen: {e}")

    return {
        "document_id": document_id,
        "status": doc["status"],
        "company_pays_analysis": bool(doc["company_pays_analysis"]),
        "expires_at": doc["expires_at"].isoformat() if doc["expires_at"] else None,
        "signers": [
            {
                "email": s["email"],
                "name": s["name"],
                "role": s["role"],
                "status": s["status"],
                "signed_at": s["signed_at"].isoformat() if s["signed_at"] else None,
                "rejection_reason": s["rejection_reason"],
            }
            for s in signers
        ],
    }


def _reset_owner_esign_if_due(cur, owner_id: str) -> None:
    cur.execute(
        """
        UPDATE public.user_quotas
        SET
            analysis_used = CASE WHEN reset_at <= NOW() THEN 0 ELSE analysis_used END,
            esign_used = CASE WHEN reset_at <= NOW() THEN 0 ELSE esign_used END,
            reset_at = CASE WHEN reset_at <= NOW() THEN date_trunc('month', NOW()) + interval '1 month' ELSE reset_at END,
            updated_at = NOW()
        WHERE user_id = %s;
        """,
        (owner_id,),
    )


def _consume_owner_esign(cur, owner_id: str) -> int | None:
    _reset_owner_esign_if_due(cur, owner_id)
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
        (owner_id,),
    )
    row = cur.fetchone()
    if not row:
        raise SupabaseServiceError(status_code=403, detail="Kuota e-sign pengirim sudah habis.")
    used = row["esign_used"]
    limit = row["esign_limit"]
    if limit is None:
        return None
    return max(0, limit - used)


def sign_document(
    document_id: str,
    signer_user_id: str,
    signer_email: str,
    signer_name: str,
    consent_text: str,
    document_hash: str,
    ip_address: str | None,
    user_agent: str | None,
) -> dict:
    signer_email = signer_email.strip().lower()
    now = _now_utc()
    signature_id = str(uuid.uuid4())

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, signer_user_id, signer_email)
            if doc["status"] in ("completed", "rejected"):
                raise SupabaseServiceError(status_code=409, detail=f"Dokumen sudah berstatus {doc['status']}.")
            if doc["expires_at"] and doc["expires_at"] <= now:
                cur.execute(
                    "UPDATE public.documents SET status='expired', updated_at=NOW() WHERE id=%s;",
                    (document_id,),
                )
                conn.commit()
                raise SupabaseServiceError(status_code=409, detail="Dokumen sudah kedaluwarsa.")

            cur.execute(
                """
                SELECT id, status
                FROM public.document_signers
                WHERE document_id = %s AND lower(email) = lower(%s)
                FOR UPDATE;
                """,
                (document_id, signer_email),
            )
            signer = cur.fetchone()
            if not signer:
                raise SupabaseServiceError(status_code=403, detail="Anda bukan signer untuk dokumen ini.")
            if signer["status"] == "signed":
                raise SupabaseServiceError(status_code=409, detail="Anda sudah menandatangani dokumen ini.")
            if signer["status"] == "rejected":
                raise SupabaseServiceError(status_code=409, detail="Anda sudah menolak dokumen ini.")

            esign_remaining = _consume_owner_esign(cur, doc["owner_id"])

            cur.execute(
                """
                INSERT INTO public.signatures (
                    id, document_id, signer_email, signer_name, ip_address, user_agent, consent_text, document_hash, signed_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    signature_id,
                    document_id,
                    signer_email,
                    signer_name.strip(),
                    ip_address,
                    user_agent,
                    consent_text.strip(),
                    document_hash.strip(),
                    now,
                ),
            )

            cur.execute(
                """
                UPDATE public.document_signers
                SET status='signed', name=%s, signed_at=%s, signature_id=%s, rejection_reason=NULL, updated_at=NOW()
                WHERE id=%s;
                """,
                (signer_name.strip(), now, signature_id, signer["id"]),
            )

            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE status='pending') AS pending_count,
                    COUNT(*) FILTER (WHERE status='signed') AS signed_count,
                    COUNT(*) FILTER (WHERE status='rejected') AS rejected_count
                FROM public.document_signers
                WHERE document_id = %s;
                """,
                (document_id,),
            )
            counts = cur.fetchone()

            if counts["rejected_count"] > 0:
                new_status = "rejected"
            elif counts["pending_count"] == 0:
                new_status = "completed"
            elif counts["signed_count"] > 0:
                new_status = "partially_signed"
            else:
                new_status = "pending_signatures"

            cur.execute(
                "UPDATE public.documents SET status=%s, updated_at=NOW() WHERE id=%s;",
                (new_status, document_id),
            )
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menandatangani dokumen: {e}")

    return {
        "success": True,
        "document_id": document_id,
        "status": new_status,
        "message": "Dokumen berhasil ditandatangani.",
        "esign_remaining": esign_remaining,
    }


def reject_document(
    document_id: str,
    signer_user_id: str,
    signer_email: str,
    reason: str | None,
) -> dict:
    signer_email = signer_email.strip().lower()
    now = _now_utc()

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, signer_user_id, signer_email)
            if doc["status"] == "completed":
                raise SupabaseServiceError(status_code=409, detail="Dokumen sudah completed dan tidak bisa ditolak.")

            cur.execute(
                """
                SELECT id, status
                FROM public.document_signers
                WHERE document_id=%s AND lower(email)=lower(%s)
                FOR UPDATE;
                """,
                (document_id, signer_email),
            )
            signer = cur.fetchone()
            if not signer:
                raise SupabaseServiceError(status_code=403, detail="Anda bukan signer untuk dokumen ini.")
            if signer["status"] == "signed":
                raise SupabaseServiceError(status_code=409, detail="Anda sudah menandatangani dokumen ini.")
            if signer["status"] == "rejected":
                raise SupabaseServiceError(status_code=409, detail="Anda sudah menolak dokumen ini.")

            cur.execute(
                """
                UPDATE public.document_signers
                SET status='rejected', rejection_reason=%s, signed_at=%s, updated_at=NOW()
                WHERE id=%s;
                """,
                (reason.strip() if reason else None, now, signer["id"]),
            )
            cur.execute(
                "UPDATE public.documents SET status='rejected', updated_at=NOW() WHERE id=%s;",
                (document_id,),
            )
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menolak dokumen: {e}")

    return {
        "success": True,
        "document_id": document_id,
        "status": "rejected",
        "message": "Dokumen berhasil ditolak.",
    }


def get_document_certificate(document_id: str, user_id: str, email: str) -> dict:
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, user_id, email)
            if doc["status"] != "completed":
                raise SupabaseServiceError(status_code=409, detail="Sertifikat hanya tersedia untuk dokumen completed.")

            cur.execute(
                """
                SELECT signer_email, signer_name, document_hash, signed_at
                FROM public.signatures
                WHERE document_id=%s
                ORDER BY signed_at ASC;
                """,
                (document_id,),
            )
            signatures = cur.fetchall()
            completed_at = signatures[-1]["signed_at"].isoformat() if signatures else None
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengambil sertifikat: {e}")

    return {
        "document_id": document_id,
        "filename": doc["filename"],
        "status": doc["status"],
        "completed_at": completed_at,
        "signatures": [
            {
                "signer_email": s["signer_email"],
                "signer_name": s["signer_name"],
                "document_hash": s["document_hash"],
                "signed_at": s["signed_at"].isoformat(),
            }
            for s in signatures
        ],
    }
