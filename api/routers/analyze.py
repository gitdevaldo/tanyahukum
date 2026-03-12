"""POST /api/analyze — Upload PDF and get contract analysis.
GET /api/analysis/{id} — Retrieve saved analysis.
GET /api/analysis/{id}/pdf — Retrieve saved PDF.
"""
import re
import asyncio
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import Response

from api.models.schemas import AnalysisResponse
from api.services.analyzer import analyze_contract
from api.services.storage import save_analysis, get_analysis, get_analysis_pdf
from api.services.guardrails import MAX_FILE_SIZE
from api.dependencies import verify_api_key

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse, dependencies=[Depends(verify_api_key)])
async def analyze_pdf(file: UploadFile = File(...)):
    """Upload a contract PDF for legal risk analysis."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename diperlukan.")

    # C-03: Check Content-Length before reading full file into memory
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File terlalu besar.")

    try:
        pdf_bytes = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Gagal membaca file.")

    # Double-check actual size after read
    if len(pdf_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File terlalu besar.")

    try:
        result = await analyze_contract(pdf_bytes, file.filename)
        # Persist result + PDF to MongoDB
        try:
            await asyncio.to_thread(save_analysis, result.model_dump(), pdf_bytes)
        except Exception as e:
            logger.warning(f"Failed to persist analysis (non-fatal): {e}")
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
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
