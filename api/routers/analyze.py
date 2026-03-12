"""POST /api/analyze — Upload PDF and get contract analysis.
GET /api/analysis/{id} — Retrieve saved analysis.
GET /api/analysis/{id}/pdf — Retrieve saved PDF.
"""
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response

from api.models.schemas import AnalysisResponse
from api.services.analyzer import analyze_contract
from api.services.storage import save_analysis, get_analysis, get_analysis_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_pdf(file: UploadFile = File(...)):
    """Upload a contract PDF for legal risk analysis."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename diperlukan.")

    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca file: {str(e)}")

    try:
        result = await analyze_contract(pdf_bytes, file.filename)
        # Persist result + PDF to MongoDB
        try:
            save_analysis(result.model_dump(), pdf_bytes)
        except Exception as e:
            logger.warning(f"Failed to persist analysis (non-fatal): {e}")
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analisis gagal: {str(e)[:200]}")


@router.get("/analysis/{analysis_id}")
async def get_analysis_result(analysis_id: str):
    """Retrieve a previously saved analysis result."""
    result = get_analysis(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analisis tidak ditemukan.")
    return result


@router.get("/analysis/{analysis_id}/pdf")
async def get_pdf(analysis_id: str):
    """Retrieve the original PDF for a saved analysis."""
    pdf_bytes = get_analysis_pdf(analysis_id)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="PDF tidak ditemukan.")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=contract-{analysis_id}.pdf"},
    )
