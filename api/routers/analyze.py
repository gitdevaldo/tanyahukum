"""POST /api/analyze — Upload PDF and get contract analysis.
GET /api/analysis/{id} — Retrieve saved analysis.
GET /api/analysis/{id}/pdf — Retrieve saved PDF.
"""
import re
import asyncio
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request, Form
from fastapi.responses import Response
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.models.schemas import AnalysisResponse
from api.services.analyzer import analyze_contract, analyze_contract_text
from api.services.storage import save_analysis, get_analysis, get_analysis_pdf
from api.services.documents import attach_document_analysis, create_analyzed_document, resolve_document_analysis_quota_owner
from api.services.guardrails import MAX_FILE_SIZE, validate_pdf_upload
from api.dependencies import verify_api_key, get_optional_bearer_token
from api.services.supabase_auth import (
    SupabaseServiceError,
    get_auth_user,
    resolve_account_plan_from_user_meta,
    upsert_user_profile_and_quota,
    consume_analysis_quota,
    refund_analysis_quota,
)

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/analyze", response_model=AnalysisResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("5/minute")
async def analyze_pdf(
    request: Request,
    file: UploadFile = File(...),
    document_id: str | None = Form(default=None),
    access_token: str | None = Depends(get_optional_bearer_token),
):
    """Upload a contract document (PDF or plain text) for legal risk analysis.

    Supports public demo usage (no bearer token) and authenticated usage
    (with quota + document linkage).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename diperlukan.")

    # C-03: Check Content-Length before reading full file into memory
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File terlalu besar.")

    try:
        file_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Gagal membaca file.")

    # Double-check actual size after read
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File terlalu besar.")

    filename = file.filename or "dokumen.pdf"
    content_type = (file.content_type or "").lower()
    lower_name = filename.lower()
    is_text_upload = lower_name.endswith(".txt") or content_type.startswith("text/")

    # Validate file type and structure before quota consumption
    text_input: str | None = None
    if is_text_upload:
        text_input = file_bytes.decode("utf-8", errors="ignore").strip()
        if not text_input:
            raise HTTPException(status_code=422, detail="Teks dokumen kosong atau tidak valid.")
    else:
        is_valid, error = validate_pdf_upload(file_bytes, filename)
        if not is_valid:
            raise HTTPException(status_code=422, detail=error)

    auth_user_id: str | None = None
    auth_email: str | None = None
    auth_name: str | None = None
    quota_user_id: str | None = None

    # If authenticated, verify and consume quota atomically.
    if access_token:
        try:
            auth_user = await asyncio.to_thread(get_auth_user, access_token)
            user_meta = auth_user.get("user_metadata") or {}
            auth_user_id = auth_user["id"]
            auth_email = auth_user.get("email", "")
            auth_name = user_meta.get("name") or auth_email.split("@")[0] or "Pengguna"
            account_type, plan = resolve_account_plan_from_user_meta(user_meta)

            await asyncio.to_thread(
                upsert_user_profile_and_quota,
                auth_user_id,
                auth_email,
                auth_name,
                plan,
                account_type,
            )

            quota_user_id = auth_user_id
            if document_id:
                billing = await asyncio.to_thread(
                    resolve_document_analysis_quota_owner,
                    document_id,
                    auth_user_id,
                    auth_email,
                )
                quota_user_id = billing["billed_user_id"]

            await asyncio.to_thread(consume_analysis_quota, quota_user_id)
        except SupabaseServiceError as e:
            if e.status_code >= 500:
                raise HTTPException(status_code=500, detail="Gagal memverifikasi kuota pengguna.")
            raise HTTPException(status_code=e.status_code, detail=e.detail)
    elif document_id:
        raise HTTPException(status_code=401, detail="Bearer token diperlukan untuk analisis dokumen dashboard.")

    try:
        if is_text_upload:
            result = await analyze_contract_text(text_input or "", filename)
        else:
            result = await analyze_contract(file_bytes, filename)

        # Persist result (+ PDF bytes when available) to Qdrant
        try:
            await asyncio.to_thread(
                save_analysis,
                result.model_dump(),
                None if is_text_upload else file_bytes,
            )
        except Exception as e:
            logger.warning(f"Failed to persist analysis (non-fatal): {e}")

        # Save linkage to document only for authenticated users.
        if document_id and auth_user_id and auth_email:
            try:
                await asyncio.to_thread(
                    attach_document_analysis,
                    document_id,
                    auth_user_id,
                    auth_email,
                    result.analysis_id,
                    filename,
                    request_id=getattr(request.state, "request_id", None),
                )
            except SupabaseServiceError as e:
                if e.status_code >= 500:
                    raise HTTPException(status_code=500, detail="Gagal mengaitkan hasil analisis ke dokumen.")
                raise HTTPException(status_code=e.status_code, detail=e.detail)
        elif auth_user_id and auth_email and auth_name:
            try:
                await asyncio.to_thread(
                    create_analyzed_document,
                    auth_user_id,
                    auth_email,
                    auth_name,
                    result.analysis_id,
                    filename,
                    getattr(request.state, "request_id", None),
                )
            except SupabaseServiceError as e:
                logger.warning(f"Failed to create standalone analyzed document: {e}")

        return result
    except ValueError as e:
        if quota_user_id:
            try:
                await asyncio.to_thread(refund_analysis_quota, quota_user_id)
            except Exception as refund_err:
                logger.error(f"Failed to refund quota during ValueError: {refund_err}")
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException as e:
        if quota_user_id:
            try:
                await asyncio.to_thread(refund_analysis_quota, quota_user_id)
            except Exception as refund_err:
                logger.error(f"Failed to refund quota during HTTPException: {refund_err}")
        raise e
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        if quota_user_id:
            try:
                await asyncio.to_thread(refund_analysis_quota, quota_user_id)
            except Exception as refund_err:
                logger.error(f"Failed to refund quota during general Exception: {refund_err}")
        raise HTTPException(status_code=500, detail="Analisis gagal. Silakan coba lagi.")


@router.get("/analysis/{analysis_id}")
async def get_analysis_result(analysis_id: str):
    """Retrieve a previously saved analysis result."""
    # H-03: Sanitize analysis_id for safe use in headers
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '', analysis_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="ID tidak valid.")

    result = await asyncio.to_thread(get_analysis, safe_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analisis tidak ditemukan.")
    return result


@router.get("/analysis/{analysis_id}/pdf")
async def get_pdf(analysis_id: str):
    """Retrieve the original PDF for a saved analysis."""
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '', analysis_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="ID tidak valid.")

    pdf_bytes = await asyncio.to_thread(get_analysis_pdf, safe_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="PDF tidak ditemukan.")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=contract-{safe_id}.pdf"},
    )
