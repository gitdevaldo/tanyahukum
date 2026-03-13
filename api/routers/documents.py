"""Document sharing and signing endpoints (v2.0-B/C)."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.dependencies import verify_bearer_token
from api.models.schemas import (
    ShareDocumentRequest,
    ShareDocumentResponse,
    DocumentSignersResponse,
    SignDocumentRequest,
    RejectDocumentRequest,
    DocumentActionResponse,
    CertificateResponse,
)
from api.services.supabase_auth import (
    SupabaseServiceError,
    get_auth_user,
    upsert_user_profile_and_quota,
)
from api.services.documents import (
    create_document_share,
    list_document_signers,
    sign_document,
    reject_document,
    get_document_certificate,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _raise_document_error(e: SupabaseServiceError, fallback: str) -> None:
    if e.status_code >= 500:
        raise HTTPException(status_code=500, detail=fallback)
    raise HTTPException(status_code=e.status_code, detail=e.detail)


async def _resolve_user(access_token: str) -> tuple[str, str, str, str]:
    auth_user = await asyncio.to_thread(get_auth_user, access_token)
    user_meta = auth_user.get("user_metadata") or {}
    user_id = auth_user["id"]
    email = auth_user.get("email", "")
    name = user_meta.get("name") or email.split("@")[0] or "Pengguna"
    plan = user_meta.get("plan") or "free"
    await asyncio.to_thread(upsert_user_profile_and_quota, user_id, email, name, plan)
    return user_id, email, name, plan


@router.post("/documents/share", response_model=ShareDocumentResponse)
@limiter.limit("60/minute")
async def share_document(
    request: Request,
    req: ShareDocumentRequest,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, name, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(
            create_document_share,
            user_id,
            email,
            name,
            req.analysis_id,
            req.filename,
            [str(e) for e in req.signer_emails],
            req.company_pays_analysis,
            req.expires_at,
        )
        return ShareDocumentResponse(**result)
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal membagikan dokumen.")


@router.get("/documents/{document_id}/signers", response_model=DocumentSignersResponse)
@limiter.limit("120/minute")
async def get_signers(
    request: Request,
    document_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(list_document_signers, document_id, user_id, email)
        return DocumentSignersResponse(**result)
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengambil signer dokumen.")


@router.post("/documents/{document_id}/sign", response_model=DocumentActionResponse)
@limiter.limit("60/minute")
async def sign_doc(
    request: Request,
    document_id: str,
    req: SignDocumentRequest,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(
            sign_document,
            document_id,
            user_id,
            email,
            req.signer_name,
            req.consent_text,
            req.document_hash,
            request.client.host if request.client else None,
            request.headers.get("User-Agent"),
        )
        return DocumentActionResponse(
            success=result["success"],
            document_id=result["document_id"],
            status=result["status"],
            message=result["message"],
        )
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal menandatangani dokumen.")


@router.post("/documents/{document_id}/reject", response_model=DocumentActionResponse)
@limiter.limit("60/minute")
async def reject_doc(
    request: Request,
    document_id: str,
    req: RejectDocumentRequest,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(reject_document, document_id, user_id, email, req.reason)
        return DocumentActionResponse(
            success=result["success"],
            document_id=result["document_id"],
            status=result["status"],
            message=result["message"],
        )
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal menolak dokumen.")


@router.get("/documents/{document_id}/certificate", response_model=CertificateResponse)
@limiter.limit("120/minute")
async def get_certificate(
    request: Request,
    document_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(get_document_certificate, document_id, user_id, email)
        return CertificateResponse(**result)
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengambil sertifikat dokumen.")
