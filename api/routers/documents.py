"""Document sharing and signing endpoints (v2.0-B/C)."""
import asyncio

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.dependencies import verify_bearer_token
from api.models.schemas import (
    DocumentListResponse,
    ShareDocumentRequest,
    ShareDocumentResponse,
    DocumentSignersResponse,
    DocumentAnalysisResponse,
    DocumentEventsResponse,
    SignDocumentRequest,
    RejectDocumentRequest,
    DocumentActionResponse,
    CertificateResponse,
)
from api.services.supabase_auth import (
    SupabaseServiceError,
    get_auth_user,
    resolve_account_plan_from_user_meta,
    upsert_user_profile_and_quota,
)
from api.services.documents import (
    list_user_documents,
    create_document_share,
    list_document_signers,
    get_document_analysis,
    list_document_events,
    sign_document,
    reject_document,
    get_document_certificate,
    get_document_certificate_pdf,
    get_document_pdf_for_signing,
    get_signed_document_pdf,
    quick_sign_document,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _raise_document_error(e: SupabaseServiceError, fallback: str) -> None:
    if e.status_code >= 500:
        raise HTTPException(status_code=500, detail=fallback)
    raise HTTPException(status_code=e.status_code, detail=e.detail)


async def _resolve_user(access_token: str) -> tuple[str, str, str, str | None]:
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
    return user_id, email, name, plan


@router.get("/documents", response_model=DocumentListResponse)
@limiter.limit("120/minute")
async def list_documents(
    request: Request,
    limit: int = 100,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(list_user_documents, user_id, email, limit)
        return DocumentListResponse(**result)
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengambil daftar dokumen.")


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
            getattr(request.state, "request_id", None),
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


@router.get("/documents/{document_id}/analysis", response_model=DocumentAnalysisResponse)
@limiter.limit("120/minute")
async def get_document_analysis_result(
    request: Request,
    document_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(get_document_analysis, document_id, user_id, email)
        return DocumentAnalysisResponse(**result)
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengambil analisis dokumen.")


@router.get("/documents/{document_id}/events", response_model=DocumentEventsResponse)
@limiter.limit("120/minute")
async def get_events(
    request: Request,
    document_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(list_document_events, document_id, user_id, email)
        return DocumentEventsResponse(**result)
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengambil audit trail dokumen.")


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
            getattr(request.state, "request_id", None),
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
        result = await asyncio.to_thread(
            reject_document,
            document_id,
            user_id,
            email,
            req.reason,
            getattr(request.state, "request_id", None),
        )
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
        result = await asyncio.to_thread(
            get_document_certificate,
            document_id,
            user_id,
            email,
            getattr(request.state, "request_id", None),
        )
        return CertificateResponse(**result)
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengambil sertifikat dokumen.")


@router.get("/documents/{document_id}/certificate/pdf")
@limiter.limit("60/minute")
async def download_certificate_pdf(
    request: Request,
    document_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(
            get_document_certificate_pdf,
            document_id,
            user_id,
            email,
            getattr(request.state, "request_id", None),
        )
        return Response(
            content=result["pdf_bytes"],
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={result['filename']}"},
        )
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengunduh PDF sertifikat.")


@router.get("/documents/{document_id}/signed-pdf")
@limiter.limit("60/minute")
async def download_signed_pdf(
    request: Request,
    document_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(
            get_signed_document_pdf,
            document_id,
            user_id,
            email,
            getattr(request.state, "request_id", None),
        )
        return Response(
            content=result["pdf_bytes"],
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={result['filename']}"},
        )
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal mengunduh dokumen final bertanda tangan.")


@router.post("/documents/quick-sign")
@limiter.limit("30/minute")
async def quick_sign(
    request: Request,
    file: UploadFile = File(...),
    signer_name: str = Form(...),
    access_token: str = Depends(verify_bearer_token),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Hanya file PDF yang didukung.")
    pdf_bytes = await file.read()
    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ukuran file maksimal 20MB.")
    if len(pdf_bytes) < 100:
        raise HTTPException(status_code=422, detail="File PDF tidak valid.")
    try:
        user_id, email, name, _ = await _resolve_user(access_token)
        result = await asyncio.to_thread(
            quick_sign_document,
            user_id,
            email,
            name,
            signer_name.strip() or name,
            file.filename,
            pdf_bytes,
            request.client.host if request.client else None,
            request.headers.get("User-Agent"),
            getattr(request.state, "request_id", None),
        )
        return Response(
            content=result["pdf_bytes"],
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={result['filename']}",
                "X-Document-Id": result["document_id"],
            },
        )
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal menandatangani dokumen.")


@router.get("/documents/{document_id}/pdf")
@limiter.limit("60/minute")
async def get_document_pdf(
    request: Request,
    document_id: str,
    access_token: str = Depends(verify_bearer_token),
):
    """Retrieve original document PDF for viewing/signing."""
    try:
        user_id, email, _, _ = await _resolve_user(access_token)
        
        # Get original PDF for signing (no completion status required)
        result = await asyncio.to_thread(
            get_document_pdf_for_signing,
            document_id,
            user_id,
            email,
            getattr(request.state, "request_id", None),
        )
        
        return Response(
            content=result["pdf_bytes"],
            media_type="application/pdf",
        )
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal memuat PDF dokumen.")


@router.post("/documents/{document_id}/sign-visual")
@limiter.limit("30/minute")
async def sign_document_visual(
    request: Request,
    document_id: str,
    signed_pdf: UploadFile = File(...),
    signer_name: str = Form(...),
    access_token: str = Depends(verify_bearer_token),
):
    """Save visually signed PDF and record signature."""
    try:
        user_id, email, name, _ = await _resolve_user(access_token)
        pdf_bytes = await signed_pdf.read()
        
        if len(pdf_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Ukuran file terlalu besar.")
        
        # Import the service function to save visual signature
        from api.services.documents import save_visual_signature
        result = await asyncio.to_thread(
            save_visual_signature,
            document_id,
            user_id,
            email,
            signer_name.strip() or name,
            pdf_bytes,
            request.client.host if request.client else None,
            request.headers.get("User-Agent"),
            getattr(request.state, "request_id", None),
        )
        
        return result
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal menyimpan tanda tangan visual.")


@router.post("/api/documents/{document_id}/sign-visual-finalize")
async def sign_visual_finalize(
    request: Request,
    document_id: str,
    body: dict = None,
    access_token: str = Depends(verify_bearer_token),
):
    """
    Finalize visual signature on document from the full-screen signing editor.
    This endpoint is called after user places signature on PDF in new tab.
    """
    try:
        if body is None:
            body = await request.json()
        
        user_id, email, name, _ = await _resolve_user(access_token)
        signer_name = body.get("signer_name", name)
        signature_type = body.get("signature_type", "text")
        positions = body.get("positions", [])
        
        if not signer_name:
            raise HTTPException(status_code=400, detail="Signer name required")
        
        if not positions:
            raise HTTPException(status_code=400, detail="Signature positions required")
        
        # Import service to update document signer status
        from api.services.documents import update_document_signer_status, get_document_by_id
        from api.services.signature_manager import save_document_signature
        
        # Get document
        doc = await asyncio.to_thread(get_document_by_id, document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Update signer status to 'signed'
        update_result = await asyncio.to_thread(
            update_document_signer_status,
            document_id,
            user_id,
            email,
            "signed",
        )
        
        # Save signature record
        await asyncio.to_thread(
            save_document_signature,
            document_id,
            signer_name,
            None,  # user_signature_id - would be set from user_signatures table
            signature_type,
        )
        
        # Record event
        from api.services.documents import record_document_event
        await asyncio.to_thread(
            record_document_event,
            document_id,
            user_id,
            email,
            "signed",
            {"signature_type": signature_type, "position_count": len(positions)},
            request.client.host if request.client else None,
            request.headers.get("User-Agent"),
        )
        
        return {
            "success": True,
            "message": "Document signed successfully",
            "document_id": document_id,
            "status": "signed",
        }
        
    except HTTPException:
        raise
    except SupabaseServiceError as e:
        _raise_document_error(e, "Gagal menandatangani dokumen.")
    except Exception as e:
        logger.error(f"Error finalizing signature: {str(e)}")
        raise HTTPException(status_code=500, detail="Gagal menandatangani dokumen.")

