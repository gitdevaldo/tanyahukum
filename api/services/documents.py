"""Document sharing and signing service (v2.0-B/C)."""
from __future__ import annotations

import logging
import hashlib
import re
import uuid
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from api.config import settings
from api.services.email import (
    send_signing_invitation,
    send_signing_status_update,
    send_signing_completed_notice,
)
from api.services.signing_pdf import (
    build_certificate_pdf,
    build_signed_document_pdf,
    apply_visual_signatures,
)
from api.services.supabase_auth import SupabaseServiceError
from api.services.storage import get_analysis, get_analysis_pdf

logger = logging.getLogger(__name__)


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


def _app_base_url() -> str:
    if settings.app_base_url:
        return settings.app_base_url.rstrip("/")
    return "https://tanyahukum.dev"


def _document_review_link(document_id: str) -> str:
    return f"{_app_base_url()}/cek-dokumen/?document_id={document_id}"


def _signed_pdf_download_link(document_id: str) -> str:
    return f"{_app_base_url()}/api/documents/{document_id}/signed-pdf"


def _certificate_pdf_download_link(document_id: str) -> str:
    return f"{_app_base_url()}/api/documents/{document_id}/certificate/pdf"


def _safe_download_filename(filename: str, suffix: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", filename).strip("-")
    if not sanitized:
        sanitized = "document"
    if sanitized.lower().endswith(".pdf"):
        sanitized = sanitized[:-4]
    return f"{sanitized}-{suffix}.pdf"


def _append_event(
    cur,
    document_id: str,
    event_type: str,
    actor_user_id: str | None,
    actor_email: str | None,
    request_id: str | None,
    metadata: dict | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO public.document_events (
            id, document_id, actor_user_id, actor_email, event_type, request_id, metadata
        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
        """,
        (
            str(uuid.uuid4()),
            document_id,
            actor_user_id,
            actor_email,
            event_type,
            request_id,
            Json(metadata or {}),
        ),
    )


def create_document_share(
    owner_id: str,
    owner_email: str,
    owner_name: str,
    analysis_id: str | None,
    filename: str,
    signer_emails: list[str],
    company_pays_analysis: bool,
    expires_at: str | None,
    request_id: str | None = None,
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

            _append_event(
                cur,
                document_id=document_id,
                event_type="shared",
                actor_user_id=owner_id,
                actor_email=owner_email,
                request_id=request_id,
                metadata={
                    "analysis_id": analysis_id,
                    "filename": filename,
                    "company_pays_analysis": company_pays_analysis,
                    "signers_count": 1 + len(recipient_emails),
                },
            )

            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal membuat dokumen sharing: {e}")

    review_link = _document_review_link(document_id)
    for recipient_email in recipient_emails:
        sent = send_signing_invitation(
            to_email=recipient_email,
            sender_name=owner_name,
            sender_email=owner_email,
            document_name=filename,
            review_link=review_link,
            expires_at=expiry.isoformat() if expiry else None,
            company_pays_analysis=company_pays_analysis,
        )
        if not sent:
            logger.warning("Failed to send signing invitation email to %s", recipient_email)

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


def list_user_documents(user_id: str, email: str, limit: int = 100) -> dict:
    safe_limit = max(1, min(limit, 200))
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id AS document_id,
                    d.filename,
                    d.status,
                    d.analysis_id,
                    d.company_pays_analysis,
                    d.expires_at,
                    d.created_at,
                    d.updated_at,
                    d.owner_id,
                    owner.email AS owner_email,
                    me.role AS my_signer_role,
                    me.status AS my_signer_status,
                    COALESCE(stats.total_count, 0) AS signers_total,
                    COALESCE(stats.pending_count, 0) AS signers_pending,
                    COALESCE(stats.signed_count, 0) AS signers_signed,
                    COALESCE(stats.rejected_count, 0) AS signers_rejected
                FROM public.documents d
                LEFT JOIN public.user_profiles owner
                    ON owner.user_id = d.owner_id
                LEFT JOIN LATERAL (
                    SELECT s.role, s.status
                    FROM public.document_signers s
                    WHERE s.document_id = d.id AND lower(s.email) = lower(%s)
                    LIMIT 1
                ) me ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        COUNT(*) AS total_count,
                        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
                        COUNT(*) FILTER (WHERE status = 'signed') AS signed_count,
                        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count
                    FROM public.document_signers s2
                    WHERE s2.document_id = d.id
                ) stats ON TRUE
                WHERE d.owner_id = %s OR me.status IS NOT NULL
                ORDER BY d.updated_at DESC
                LIMIT %s;
                """,
                (email.strip().lower(), user_id, safe_limit),
            )
            rows = cur.fetchall()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengambil daftar dokumen: {e}")

    now = _now_utc()
    documents: list[dict] = []
    pending_my_action = 0
    owned_total = 0

    for row in rows:
        is_owner = str(row["owner_id"]) == user_id
        effective_status = row["status"]
        if (
            effective_status not in ("completed", "expired", "rejected")
            and row["expires_at"]
            and row["expires_at"] <= now
        ):
            effective_status = "expired"

        if is_owner:
            owned_total += 1
        if row["my_signer_status"] == "pending":
            pending_my_action += 1

        documents.append(
            {
                "document_id": row["document_id"],
                "filename": row["filename"],
                "status": effective_status,
                "analysis_id": row["analysis_id"],
                "company_pays_analysis": bool(row["company_pays_analysis"]),
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "owner_id": str(row["owner_id"]),
                "owner_email": row["owner_email"],
                "is_owner": is_owner,
                "my_signer_role": "sender" if is_owner else row["my_signer_role"],
                "my_signer_status": row["my_signer_status"],
                "signers_total": int(row["signers_total"] or 0),
                "signers_pending": int(row["signers_pending"] or 0),
                "signers_signed": int(row["signers_signed"] or 0),
                "signers_rejected": int(row["signers_rejected"] or 0),
            }
        )

    return {
        "total": len(documents),
        "owned_total": owned_total,
        "pending_my_action": pending_my_action,
        "documents": documents,
    }


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


def resolve_document_analysis_quota_owner(
    document_id: str,
    requester_user_id: str,
    requester_email: str,
) -> dict:
    """Resolve which user quota should be charged for a shared-document analysis."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, requester_user_id, requester_email)
            now = _now_utc()
            if doc["expires_at"] and doc["expires_at"] <= now:
                cur.execute(
                    "UPDATE public.documents SET status='expired', updated_at=NOW() WHERE id=%s;",
                    (document_id,),
                )
                conn.commit()
                raise SupabaseServiceError(status_code=409, detail="Dokumen sudah kedaluwarsa.")
            if doc["status"] in ("expired", "rejected"):
                raise SupabaseServiceError(
                    status_code=409,
                    detail=f"Dokumen berstatus {doc['status']} dan tidak dapat dianalisis ulang.",
                )
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal memproses billing analisis dokumen: {e}")

    owner_user_id = str(doc["owner_id"])
    company_pays = bool(doc["company_pays_analysis"])
    billed_user_id = owner_user_id if company_pays else requester_user_id
    return {
        "document_id": document_id,
        "owner_user_id": owner_user_id,
        "company_pays_analysis": company_pays,
        "billed_user_id": billed_user_id,
    }


def attach_document_analysis(
    document_id: str,
    requester_user_id: str,
    requester_email: str,
    analysis_id: str,
    filename: str,
) -> dict:
    """Link a newly created analysis result to an existing shared document."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, requester_user_id, requester_email)
            if doc["status"] in ("expired", "rejected"):
                raise SupabaseServiceError(
                    status_code=409,
                    detail=f"Dokumen berstatus {doc['status']} dan tidak dapat diperbarui.",
                )
            cur.execute(
                """
                UPDATE public.documents
                SET
                    analysis_id = %s,
                    filename = COALESCE(NULLIF(%s, ''), filename),
                    status = CASE WHEN status = 'draft' THEN 'analyzed' ELSE status END,
                    updated_at = NOW()
                WHERE id = %s;
                """,
                (analysis_id, filename.strip(), document_id),
            )
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengaitkan analisis ke dokumen: {e}")

    return {"document_id": document_id, "analysis_id": analysis_id}


def create_analyzed_document(
    owner_id: str,
    owner_email: str,
    owner_name: str,
    analysis_id: str,
    filename: str,
    request_id: str | None = None,
) -> dict:
    """Create a standalone document record specifically for a new analysis upload."""
    owner_email = owner_email.strip().lower()
    document_id = str(uuid.uuid4())

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            # 1. Insert the document as 'analyzed'
            cur.execute(
                """
                INSERT INTO public.documents (
                    id, owner_id, analysis_id, filename, status
                ) VALUES (%s, %s, %s, %s, 'analyzed');
                """,
                (document_id, owner_id, analysis_id, filename),
            )

            # 3. Add an event log
            _append_event(
                cur,
                document_id=document_id,
                event_type="analyzed",
                actor_user_id=owner_id,
                actor_email=owner_email,
                request_id=request_id,
                metadata={
                    "analysis_id": analysis_id,
                    "standalone_analysis": True,
                },
            )

            conn.commit()
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menyimpan riwayat analisis mandiri: {e}")

    return {
        "document_id": document_id,
        "status": "analyzed",
    }


def get_document_analysis(document_id: str, user_id: str, email: str) -> dict:
    """Fetch linked analysis result for a shared document (owner or signer only)."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, user_id, email)
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal memuat dokumen: {e}")

    analysis_id = doc.get("analysis_id")
    if not analysis_id:
        raise SupabaseServiceError(status_code=404, detail="Analisis untuk dokumen ini belum tersedia.")

    analysis = get_analysis(analysis_id)
    if not analysis:
        raise SupabaseServiceError(status_code=404, detail="Data analisis tidak ditemukan.")

    return {
        "document_id": document_id,
        "analysis_id": analysis_id,
        "company_pays_analysis": bool(doc["company_pays_analysis"]),
        "analysis": analysis,
    }


def list_document_events(document_id: str, user_id: str, email: str, limit: int = 100) -> dict:
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            _load_document_with_access(cur, document_id, user_id, email)
            cur.execute(
                """
                SELECT id, event_type, actor_email, request_id, metadata, created_at
                FROM public.document_events
                WHERE document_id = %s
                ORDER BY created_at DESC
                LIMIT %s;
                """,
                (document_id, limit),
            )
            events = cur.fetchall()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengambil audit trail dokumen: {e}")

    return {
        "document_id": document_id,
        "events": [
            {
                "id": e["id"],
                "event_type": e["event_type"],
                "actor_email": e["actor_email"],
                "request_id": e["request_id"],
                "metadata": e["metadata"] or {},
                "created_at": e["created_at"].isoformat(),
            }
            for e in events
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
    request_id: str | None = None,
) -> dict:
    signer_email = signer_email.strip().lower()
    now = _now_utc()
    signature_id = str(uuid.uuid4())
    owner_email: str | None = None
    participant_emails: list[str] = []

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, signer_user_id, signer_email)
            previous_status = doc["status"]
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
                SELECT email
                FROM public.user_profiles
                WHERE user_id = %s
                LIMIT 1;
                """,
                (doc["owner_id"],),
            )
            owner = cur.fetchone()
            owner_email = owner["email"] if owner else None

            cur.execute(
                """
                SELECT id, status, role
                FROM public.document_signers
                WHERE document_id = %s AND lower(email) = lower(%s)
                FOR UPDATE;
                """,
                (document_id, signer_email),
            )
            signer = cur.fetchone()
            if not signer:
                is_owner = str(doc["owner_id"]) == str(signer_user_id)
                if not is_owner:
                    raise SupabaseServiceError(status_code=403, detail="Anda bukan signer untuk dokumen ini.")

                # Owner can sign analyzed docs even if signer row has not been created yet.
                cur.execute(
                    """
                    INSERT INTO public.document_signers (
                        id, document_id, email, name, role, status, signed_at, signature_id, rejection_reason
                    )
                    VALUES (%s, %s, %s, %s, 'sender', 'pending', NULL, NULL, NULL)
                    ON CONFLICT (document_id, email) DO NOTHING;
                    """,
                    (str(uuid.uuid4()), document_id, signer_email, signer_name.strip() or None),
                )
                cur.execute(
                    """
                    SELECT id, status, role
                    FROM public.document_signers
                    WHERE document_id = %s AND lower(email) = lower(%s)
                    FOR UPDATE;
                    """,
                    (document_id, signer_email),
                )
                signer = cur.fetchone()
                if not signer:
                    raise SupabaseServiceError(status_code=500, detail="Gagal membuat signer owner.")
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

            _append_event(
                cur,
                document_id=document_id,
                event_type="signed",
                actor_user_id=signer_user_id,
                actor_email=signer_email,
                request_id=request_id,
                metadata={
                    "signature_id": signature_id,
                    "signer_role": signer["role"],
                    "status_after": new_status,
                    "esign_remaining_owner": esign_remaining,
                },
            )
            if previous_status != new_status:
                _append_event(
                    cur,
                    document_id=document_id,
                    event_type="status_changed",
                    actor_user_id=signer_user_id,
                    actor_email=signer_email,
                    request_id=request_id,
                    metadata={"from": previous_status, "to": new_status},
                )

            if new_status == "completed":
                cur.execute(
                    """
                    SELECT email
                    FROM public.document_signers
                    WHERE document_id = %s;
                    """,
                    (document_id,),
                )
                participant_emails = [row["email"] for row in cur.fetchall() if row.get("email")]

            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menandatangani dokumen: {e}")

    detail_link = _document_review_link(document_id)
    if owner_email and owner_email.lower() != signer_email:
        sent = send_signing_status_update(
            to_email=owner_email,
            document_name=doc["filename"],
            actor_name=signer_name.strip(),
            actor_email=signer_email,
            action="signed",
            detail_link=detail_link,
        )
        if not sent:
            logger.warning("Failed to send signing status update email to owner: %s", owner_email)

    if new_status == "completed":
        signed_pdf_link = _signed_pdf_download_link(document_id)
        certificate_link = _certificate_pdf_download_link(document_id)
        for recipient_email in {e.lower() for e in participant_emails if e}:
            sent = send_signing_completed_notice(
                to_email=recipient_email,
                document_name=doc["filename"],
                signed_pdf_link=signed_pdf_link,
                certificate_link=certificate_link,
            )
            if not sent:
                logger.warning("Failed to send completed-signing email to %s", recipient_email)

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
    request_id: str | None = None,
) -> dict:
    signer_email = signer_email.strip().lower()
    now = _now_utc()
    owner_email: str | None = None

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, signer_user_id, signer_email)
            previous_status = doc["status"]
            if doc["status"] == "completed":
                raise SupabaseServiceError(status_code=409, detail="Dokumen sudah completed dan tidak bisa ditolak.")

            cur.execute(
                """
                SELECT email
                FROM public.user_profiles
                WHERE user_id = %s
                LIMIT 1;
                """,
                (doc["owner_id"],),
            )
            owner = cur.fetchone()
            owner_email = owner["email"] if owner else None

            cur.execute(
                """
                SELECT id, status, role
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
            _append_event(
                cur,
                document_id=document_id,
                event_type="rejected",
                actor_user_id=signer_user_id,
                actor_email=signer_email,
                request_id=request_id,
                metadata={
                    "reason": reason.strip() if reason else None,
                    "signer_role": signer["role"],
                },
            )
            if previous_status != "rejected":
                _append_event(
                    cur,
                    document_id=document_id,
                    event_type="status_changed",
                    actor_user_id=signer_user_id,
                    actor_email=signer_email,
                    request_id=request_id,
                    metadata={"from": previous_status, "to": "rejected"},
                )
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menolak dokumen: {e}")

    detail_link = _document_review_link(document_id)
    if owner_email and owner_email.lower() != signer_email:
        sent = send_signing_status_update(
            to_email=owner_email,
            document_name=doc["filename"],
            actor_name=signer_email.split("@")[0],
            actor_email=signer_email,
            action="rejected",
            detail_link=detail_link,
        )
        if not sent:
            logger.warning("Failed to send rejection status email to owner: %s", owner_email)

    return {
        "success": True,
        "document_id": document_id,
        "status": "rejected",
        "message": "Dokumen berhasil ditolak.",
    }


def _load_certificate_source(cur, document_id: str, user_id: str, email: str) -> tuple[dict, list[dict], str | None]:
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
    return doc, signatures, completed_at


def _build_certificate_payload(document_id: str, doc: dict, signatures: list[dict], completed_at: str | None) -> dict:
    return {
        "document_id": document_id,
        "filename": doc["filename"],
        "status": doc["status"],
        "completed_at": completed_at,
        "certificate_pdf_url": _certificate_pdf_download_link(document_id),
        "signed_pdf_url": _signed_pdf_download_link(document_id),
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


def get_document_certificate(
    document_id: str,
    user_id: str,
    email: str,
    request_id: str | None = None,
) -> dict:
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc, signatures, completed_at = _load_certificate_source(cur, document_id, user_id, email)
            _append_event(
                cur,
                document_id=document_id,
                event_type="certificate_viewed",
                actor_user_id=user_id,
                actor_email=email,
                request_id=request_id,
                metadata={"signatures_count": len(signatures), "action": "certificate_viewed"},
            )
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengambil sertifikat: {e}")

    return _build_certificate_payload(document_id, doc, signatures, completed_at)


def get_document_certificate_pdf(
    document_id: str,
    user_id: str,
    email: str,
    request_id: str | None = None,
) -> dict:
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc, signatures, completed_at = _load_certificate_source(cur, document_id, user_id, email)
            _append_event(
                cur,
                document_id=document_id,
                event_type="certificate_viewed",
                actor_user_id=user_id,
                actor_email=email,
                request_id=request_id,
                metadata={"signatures_count": len(signatures), "action": "certificate_pdf_downloaded"},
            )
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menyiapkan PDF sertifikat: {e}")

    certificate_payload = _build_certificate_payload(document_id, doc, signatures, completed_at)
    try:
        pdf_bytes = build_certificate_pdf(certificate_payload)
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal membuat file PDF sertifikat: {e}")

    return {
        "document_id": document_id,
        "filename": _safe_download_filename(doc["filename"], "certificate"),
        "pdf_bytes": pdf_bytes,
    }


def get_document_pdf_for_signing(
    document_id: str,
    user_id: str,
    email: str,
    request_id: str | None = None,
) -> dict:
    """Get original PDF for viewing/signing (no status requirement)."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc = _load_document_with_access(cur, document_id, user_id, email)
            analysis_id = doc.get("analysis_id")
            if not analysis_id:
                raise SupabaseServiceError(
                    status_code=404,
                    detail="Dokumen belum memiliki PDF analisis.",
                )
    except SupabaseServiceError:
        raise
    except Exception as e:
        logger.error(f"Error loading document for PDF signing: {e}", exc_info=True)
        raise SupabaseServiceError(status_code=500, detail=f"Gagal memuat dokumen: {e}")

    try:
        original_pdf = get_analysis_pdf(analysis_id)
    except Exception as e:
        logger.error(f"Error retrieving PDF from analysis: {e}", exc_info=True)
        raise SupabaseServiceError(status_code=500, detail=f"Gagal mengambil PDF: {e}")
    
    if not original_pdf:
        raise SupabaseServiceError(status_code=404, detail="PDF tidak ditemukan di storage.")

    return {
        "document_id": document_id,
        "filename": doc["filename"],
        "pdf_bytes": original_pdf,
    }


def _insert_pdf_version(
    cur,
    document_id: str,
    version_type: str,
    pdf_bytes: bytes,
    created_by_user_id: str,
    created_by_email: str,
    metadata: dict | None = None,
) -> dict:
    cur.execute(
        """
        SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
        FROM public.document_pdf_versions
        WHERE document_id = %s;
        """,
        (document_id,),
    )
    next_version = int(cur.fetchone()["next_version"])
    version_id = str(uuid.uuid4())
    cur.execute(
        """
        INSERT INTO public.document_pdf_versions (
            id, document_id, version_no, version_type, pdf_bytes, created_by_user_id, created_by_email, metadata
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """,
        (
            version_id,
            document_id,
            next_version,
            version_type,
            pdf_bytes,
            created_by_user_id,
            created_by_email,
            Json(metadata or {}),
        ),
    )
    return {"id": version_id, "version_no": next_version, "version_type": version_type}


def save_signed_pdf_version(
    document_id: str,
    user_id: str,
    email: str,
    original_pdf: bytes,
    signed_pdf: bytes,
    signature_type: str,
    positions: list[dict],
    request_id: str | None = None,
) -> dict:
    """Save immutable PDF versions (original + signed_visual) without overwriting source PDF."""
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            _load_document_with_access(cur, document_id, user_id, email)
            cur.execute("SELECT id FROM public.documents WHERE id=%s FOR UPDATE;", (document_id,))

            cur.execute(
                """
                SELECT 1
                FROM public.document_pdf_versions
                WHERE document_id = %s AND version_type = 'original'
                LIMIT 1;
                """,
                (document_id,),
            )
            if not cur.fetchone():
                _insert_pdf_version(
                    cur,
                    document_id=document_id,
                    version_type="original",
                    pdf_bytes=original_pdf,
                    created_by_user_id=user_id,
                    created_by_email=email,
                    metadata={"request_id": request_id},
                )

            signed_version = _insert_pdf_version(
                cur,
                document_id=document_id,
                version_type="signed_visual",
                pdf_bytes=signed_pdf,
                created_by_user_id=user_id,
                created_by_email=email,
                metadata={
                    "signature_type": signature_type,
                    "positions": positions,
                    "request_id": request_id,
                },
            )
            conn.commit()
            return {"saved": True, **signed_version}
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menyimpan versi PDF: {e}")


def finalize_visual_signature(
    document_id: str,
    signer_user_id: str,
    signer_email: str,
    signer_name: str,
    signature_type: str,
    signature_image: str | None,
    positions: list[dict],
    ip_address: str | None,
    user_agent: str | None,
    request_id: str | None = None,
) -> dict:
    """Finalize visual signing: sign workflow + immutable signed PDF version."""
    if not positions:
        raise SupabaseServiceError(status_code=400, detail="Posisi tanda tangan wajib diisi.")
    if signature_type not in {"text", "drawn", "image"}:
        raise SupabaseServiceError(status_code=422, detail="Tipe tanda tangan tidak valid.")
    if signature_type in {"drawn", "image"} and not signature_image:
        raise SupabaseServiceError(
            status_code=422,
            detail="Gambar tanda tangan wajib untuk tipe drawn/image.",
        )

    normalized_positions: list[dict] = []
    for raw in positions:
        try:
            page = int(raw.get("page"))
            x = float(raw.get("x"))
            y = float(raw.get("y"))
            width = float(raw.get("width"))
            height = float(raw.get("height"))
            page_width = float(raw.get("page_width") or raw.get("pageWidth"))
            page_height = float(raw.get("page_height") or raw.get("pageHeight"))
        except Exception:
            raise SupabaseServiceError(status_code=422, detail="Format posisi tanda tangan tidak valid.")

        if page < 1:
            raise SupabaseServiceError(status_code=422, detail="Nomor halaman tanda tangan tidak valid.")
        if page_width <= 0 or page_height <= 0:
            raise SupabaseServiceError(status_code=422, detail="Ukuran halaman tanda tangan tidak valid.")
        if width < 24 or height < 16:
            raise SupabaseServiceError(status_code=422, detail="Ukuran tanda tangan terlalu kecil.")
        if x < 0 or y < 0 or x > page_width or y > page_height:
            raise SupabaseServiceError(status_code=422, detail="Posisi tanda tangan di luar area halaman.")

        normalized_positions.append(
            {
                "page": page,
                "x": x,
                "y": y,
                "width": width,
                "height": height,
                "page_width": page_width,
                "page_height": page_height,
            }
        )

    source = get_document_pdf_for_signing(document_id, signer_user_id, signer_email, request_id)
    original_pdf = source["pdf_bytes"]
    try:
        visual_signed_pdf = apply_visual_signatures(
            original_pdf=original_pdf,
            positions=normalized_positions,
            signature_type=signature_type,
            signer_name=signer_name,
            signature_image=signature_image,
        )
    except ValueError as e:
        raise SupabaseServiceError(status_code=422, detail=str(e))
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menempel tanda tangan ke PDF: {e}")
    document_hash = hashlib.sha256(visual_signed_pdf).hexdigest()

    sign_result = sign_document(
        document_id=document_id,
        signer_user_id=signer_user_id,
        signer_email=signer_email,
        signer_name=signer_name,
        consent_text="Saya menyetujui penandatanganan visual dokumen ini di editor TanyaHukum.",
        document_hash=document_hash,
        ip_address=ip_address,
        user_agent=user_agent,
        request_id=request_id,
    )

    version_result = save_signed_pdf_version(
        document_id=document_id,
        user_id=signer_user_id,
        email=signer_email,
        original_pdf=original_pdf,
        signed_pdf=visual_signed_pdf,
        signature_type=signature_type,
        positions=normalized_positions,
        request_id=request_id,
    )

    return {
        **sign_result,
        "signature_type": signature_type,
        "positions_count": len(normalized_positions),
        "pdf_version": version_result,
    }


def get_signed_document_pdf(
    document_id: str,
    user_id: str,
    email: str,
    request_id: str | None = None,
) -> dict:
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            doc, signatures, completed_at = _load_certificate_source(cur, document_id, user_id, email)
            analysis_id = doc.get("analysis_id")
            if not analysis_id:
                raise SupabaseServiceError(
                    status_code=404,
                    detail="Dokumen ini belum memiliki sumber PDF analisis untuk diunduh.",
                )

            cur.execute(
                """
                SELECT version_no, pdf_bytes
                FROM public.document_pdf_versions
                WHERE document_id = %s AND version_type = 'signed_visual'
                ORDER BY version_no DESC
                LIMIT 1;
                """,
                (document_id,),
            )
            latest_signed_version = cur.fetchone()

            _append_event(
                cur,
                document_id=document_id,
                event_type="certificate_viewed",
                actor_user_id=user_id,
                actor_email=email,
                request_id=request_id,
                metadata={"signatures_count": len(signatures), "action": "signed_pdf_downloaded"},
            )
            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menyiapkan dokumen final: {e}")

    if latest_signed_version and latest_signed_version.get("pdf_bytes"):
        version_bytes = latest_signed_version["pdf_bytes"]
        if isinstance(version_bytes, memoryview):
            version_bytes = version_bytes.tobytes()
        return {
            "document_id": document_id,
            "filename": _safe_download_filename(doc["filename"], f"signed-v{latest_signed_version['version_no']}"),
            "pdf_bytes": version_bytes,
        }

    original_pdf = get_analysis_pdf(analysis_id)
    if not original_pdf:
        raise SupabaseServiceError(status_code=404, detail="Sumber PDF analisis tidak ditemukan.")

    certificate_payload = _build_certificate_payload(document_id, doc, signatures, completed_at)
    try:
        signed_pdf = build_signed_document_pdf(original_pdf, certificate_payload)
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal membuat PDF final bertanda tangan: {e}")

    return {
        "document_id": document_id,
        "filename": _safe_download_filename(doc["filename"], "signed"),
        "pdf_bytes": signed_pdf,
    }


def quick_sign_document(
    owner_id: str,
    owner_email: str,
    owner_name: str,
    signer_name: str,
    filename: str,
    pdf_bytes: bytes,
    ip_address: str | None,
    user_agent: str | None,
    request_id: str | None = None,
) -> dict:
    """Privy-like quick sign: upload PDF + sign in one step.

    Creates a document record with the user as the sole signer,
    auto-signs it, stamps the certificate onto the PDF, and returns
    the final signed PDF bytes.
    """
    import hashlib

    owner_email = owner_email.strip().lower()
    now = _now_utc()
    document_id = str(uuid.uuid4())
    signer_id = str(uuid.uuid4())
    signature_id = str(uuid.uuid4())
    document_hash = hashlib.sha256(pdf_bytes).hexdigest()
    consent_text = "Saya menyetujui penandatanganan elektronik dokumen ini."

    try:
        with _db_connect() as conn, conn.cursor() as cur:
            # Create document record
            cur.execute(
                """
                INSERT INTO public.documents (
                    id, owner_id, analysis_id, filename, status, company_pays_analysis, expires_at
                ) VALUES (%s, %s, NULL, %s, 'completed', false, NULL);
                """,
                (document_id, owner_id, filename),
            )

            # Create signer record (self, already signed)
            cur.execute(
                """
                INSERT INTO public.document_signers (id, document_id, email, name, role, status, signed_at, signature_id)
                VALUES (%s, %s, %s, %s, 'sender', 'signed', %s, %s);
                """,
                (signer_id, document_id, owner_email, signer_name.strip(), now, signature_id),
            )

            # Create signature record
            cur.execute(
                """
                INSERT INTO public.signatures (
                    id, document_id, signer_email, signer_name, ip_address, user_agent, consent_text, document_hash, signed_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    signature_id,
                    document_id,
                    owner_email,
                    signer_name.strip(),
                    ip_address,
                    user_agent,
                    consent_text,
                    document_hash,
                    now,
                ),
            )

            # Consume e-sign quota
            _consume_owner_esign(cur, owner_id)

            # Audit events
            _append_event(
                cur,
                document_id=document_id,
                event_type="quick_signed",
                actor_user_id=owner_id,
                actor_email=owner_email,
                request_id=request_id,
                metadata={
                    "signature_id": signature_id,
                    "filename": filename,
                    "document_hash": document_hash,
                },
            )

            conn.commit()
    except SupabaseServiceError:
        raise
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menandatangani dokumen: {e}")

    # Build signed PDF with certificate appended
    certificate_payload = {
        "document_id": document_id,
        "filename": filename,
        "status": "completed",
        "completed_at": now.isoformat(),
        "signatures": [
            {
                "signer_email": owner_email,
                "signer_name": signer_name.strip(),
                "document_hash": document_hash,
                "signed_at": now.isoformat(),
            }
        ],
    }

    try:
        signed_pdf = build_signed_document_pdf(pdf_bytes, certificate_payload)
    except Exception as e:
        raise SupabaseServiceError(status_code=500, detail=f"Gagal membuat PDF bertanda tangan: {e}")

    return {
        "document_id": document_id,
        "filename": _safe_download_filename(filename, "signed"),
        "pdf_bytes": signed_pdf,
    }


def save_visual_signature(
    document_id: str,
    owner_id: str,
    owner_email: str,
    signer_name: str,
    signed_pdf_bytes: bytes,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> dict:
    """Save visually signed PDF and record signature in document.
    
    Handles two cases:
    1. Owner signing their analyzed document (creates signer record, 0/1 → 1/1)
    2. Co-signer signing shared document (updates existing signer record)
    """
    from datetime import datetime, timezone
    
    sb = get_supabase_client()
    now = datetime.now(timezone.utc)
    
    try:
        # Get document record
        doc_result = sb.table("documents").select("*").eq("document_id", document_id).single().execute()
        doc = doc_result.data
        if not doc:
            raise SupabaseServiceError(status_code=404, detail="Dokumen tidak ditemukan.")
        
        # Check if signer record exists
        signer_result = sb.table("document_signers").select("*").eq("document_id", document_id).eq("signer_email", owner_email).execute()
        signer = signer_result.data[0] if signer_result.data else None
        
        if not signer:
            # Case 1: Owner signing analyzed document - create signer record
            if doc["owner_id"] != owner_id:
                raise SupabaseServiceError(status_code=403, detail="Hanya pemilik atau penerima undangan yang dapat menandatangani.")
            
            # Create signer record for owner
            sb.table("document_signers").insert({
                "document_id": document_id,
                "signer_email": owner_email,
                "signer_name": signer_name.strip(),
                "role": "sender",
                "status": "signed",
                "signed_at": now.isoformat(),
            }).execute()
            
            new_signers_total = 1
            new_signers_signed = 1
            new_status = "completed"
        else:
            # Case 2: Co-signer signing shared document - update existing signer
            sb.table("document_signers").update({
                "status": "signed",
                "signed_at": now.isoformat(),
            }).eq("document_id", document_id).eq("signer_email", owner_email).execute()
            
            # Count signers
            all_signers = sb.table("document_signers").select("*").eq("document_id", document_id).execute()
            signed_count = len([s for s in all_signers.data if s["status"] == "signed"])
            total_count = len(all_signers.data)
            
            remaining = sb.table("document_signers").select("*").eq("document_id", document_id).neq("status", "signed").execute()
            
            new_signers_signed = signed_count
            new_signers_total = total_count
            new_status = "completed" if len(remaining.data) == 0 else "partially_signed"
        
        # Store signed PDF in Supabase storage
        storage_path = f"signed_documents/{owner_id}/{document_id}/{now.timestamp()}.pdf"
        sb.storage.from_("documents").upload(storage_path, signed_pdf_bytes)
        
        # Record signature event
        sb.table("document_events").insert({
            "document_id": document_id,
            "event_type": "visual_signed",
            "actor_email": owner_email,
            "actor_name": signer_name,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "metadata": {"request_id": request_id},
        }).execute()
        
        # Update document status and signer counts
        sb.table("documents").update({
            "status": new_status,
            "signers_signed": new_signers_signed,
            "signers_total": new_signers_total,
            "updated_at": now.isoformat(),
        }).eq("document_id", document_id).execute()
        
        return {
            "success": True,
            "message": "Tanda tangan visual berhasil disimpan",
            "document_id": document_id,
            "signer_email": owner_email,
            "signer_name": signer_name,
            "signed_at": now.isoformat(),
            "new_status": new_status,
            "signers_signed": new_signers_signed,
            "signers_total": new_signers_total,
        }
        
    except SupabaseServiceError:
        raise
    except Exception as e:
        logger.error(f"Error saving visual signature: {e}")
        raise SupabaseServiceError(status_code=500, detail=f"Gagal menyimpan tanda tangan visual: {e}")


def get_document_by_id(document_id: str) -> Optional[dict]:
    """Get document by ID."""
    try:
        result = supabase.table("documents").select("*").eq("id", document_id).limit(1).execute()
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"Error fetching document: {str(e)}")
        return None


def update_document_signer_status(
    document_id: str,
    user_id: str,
    email: str,
    status: str,  # 'signed', 'rejected', etc.
) -> bool:
    """Update signer status for a document."""
    try:
        # Find or create signer record
        result = supabase.table("document_signers").select("*").eq(
            "document_id", document_id
        ).eq("email", email).execute()
        
        if result.data:
            # Update existing
            supabase.table("document_signers").update({
                "status": status,
                "signed_at": "now()" if status == "signed" else None,
            }).eq("id", result.data[0]["id"]).execute()
        else:
            # Create new signer record (for owner signing analyzed doc)
            supabase.table("document_signers").insert({
                "id": str(uuid.uuid4()),
                "document_id": document_id,
                "email": email,
                "role": "sender",  # Assume owner
                "status": status,
                "signed_at": "now()" if status == "signed" else None,
            }).execute()
        
        return True
    except Exception as e:
        logger.error(f"Error updating signer status: {str(e)}")
        return False


def record_document_event(
    document_id: str,
    actor_user_id: str,
    actor_email: str,
    event_type: str,
    details: dict = None,
    ip_address: str = None,
    user_agent: str = None,
) -> bool:
    """Record an event in audit trail."""
    try:
        supabase.table("document_events").insert({
            "id": str(uuid.uuid4()),
            "document_id": document_id,
            "event_type": event_type,
            "actor_user_id": actor_user_id,
            "actor_email": actor_email,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "details": details or {},
        }).execute()
        return True
    except Exception as e:
        logger.error(f"Error recording event: {str(e)}")
        return False
