"""Consultation booking router."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import BaseModel, Field, EmailStr

from api.services.email import send_user_confirmation, send_admin_notification
from api.services.storage import get_analysis

logger = logging.getLogger(__name__)
router = APIRouter()

limiter = Limiter(key_func=get_remote_address)


class ConsultationRequest(BaseModel):
    """Consultation booking request from chatbot agent flow."""
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    whatsapp: str = Field(min_length=8, max_length=20, pattern=r"^[\d\+\-\s]+$")
    analysis_id: str | None = Field(default=None)


class ConsultationResponse(BaseModel):
    success: bool
    message: str


@router.post("/consultation", response_model=ConsultationResponse)
@limiter.limit("5/hour")
async def book_consultation(req: ConsultationRequest, request: Request):
    """Book a consultation — sends confirmation emails to user and admin."""
    logger.info(f"Consultation request from {req.name} ({req.email}) for analysis {req.analysis_id}")

    # Fetch analysis metadata if available
    analysis_filename = None
    overall_score = None
    high_risk_count = 0
    total_clauses = 0

    if req.analysis_id:
        analysis = get_analysis(req.analysis_id)
        if analysis:
            analysis_filename = analysis.get("filename")
            overall_score = analysis.get("overall_score")
            high_risk_count = analysis.get("high_risk_count", 0)
            total_clauses = analysis.get("total_clauses", 0)

    # Save booking to MongoDB
    try:
        from api.services.rag import get_db
        db = get_db()
        db["consultation_bookings"].insert_one({
            "name": req.name,
            "email": req.email,
            "whatsapp": req.whatsapp,
            "analysis_id": req.analysis_id,
            "analysis_filename": analysis_filename,
            "overall_score": overall_score,
            "created_at": datetime.now(timezone.utc),
            "status": "pending",
        })
        logger.info(f"Consultation booking saved for {req.email}")
    except Exception as e:
        logger.error(f"Failed to save booking to MongoDB: {e}", exc_info=True)

    # Send emails (non-blocking — don't fail the request if email fails)
    user_email_sent = send_user_confirmation(
        to_email=req.email,
        user_name=req.name,
        analysis_filename=analysis_filename,
        overall_score=overall_score,
    )

    admin_email_sent = send_admin_notification(
        user_name=req.name,
        user_email=req.email,
        user_wa=req.whatsapp,
        analysis_id=req.analysis_id,
        analysis_filename=analysis_filename,
        overall_score=overall_score,
        high_risk_count=high_risk_count,
        total_clauses=total_clauses,
    )

    if not user_email_sent:
        logger.warning(f"User confirmation email failed for {req.email}")
    if not admin_email_sent:
        logger.warning(f"Admin notification email failed")

    return ConsultationResponse(
        success=True,
        message="Permintaan konsultasi berhasil dikirim.",
    )
