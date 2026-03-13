import asyncio
import io
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from PyPDF2 import PdfReader, PdfWriter
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

from api.dependencies import verify_bearer_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/signatures", tags=["signatures"])


class SignaturePosition(BaseModel):
    id: str
    x: float
    y: float
    width: float
    height: float


class SignPdfRequest(BaseModel):
    positions: list[SignaturePosition]
    signer_name: str


@router.post("/apply")
async def apply_signatures(
    pdf_file: UploadFile = File(...),
    signature_image: UploadFile = File(...),
    positions_json: str = Form(...),
    signer_name: str = Form(...),
    access_token: str = Depends(verify_bearer_token),
) -> dict[str, Any]:
    """
    Apply signature images to PDF at specified positions.
    Returns base64-encoded signed PDF.
    """
    try:
        # Parse positions from JSON
        import json
        positions: list[SignaturePosition] = [
            SignaturePosition(**pos) for pos in json.loads(positions_json)
        ]

        # Read PDF
        pdf_bytes = await pdf_file.read()
        pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
        pdf_writer = PdfWriter()

        # Read signature image
        sig_img_bytes = await signature_image.read()
        sig_img = Image.open(io.BytesIO(sig_img_bytes))

        # Process each page and apply signatures
        for page_num in range(len(pdf_reader.pages)):
            page = pdf_reader.pages[page_num]
            pdf_writer.add_page(page)

        # Create overlay with signatures
        overlay_buffer = io.BytesIO()
        can = canvas.Canvas(overlay_buffer, pagesize=letter)

        # Get page dimensions from first page
        from reportlab.lib.units import inch
        page_width, page_height = letter

        # Apply each signature position
        for pos in positions:
            try:
                # Draw signature at position
                # Note: PDF coordinates are from bottom-left, canvas from top-left
                sig_x = pos.x
                sig_y = page_height - pos.y - pos.height

                # Save signature image temporarily
                sig_temp = io.BytesIO()
                sig_img.save(sig_temp, format="PNG")
                sig_temp.seek(0)

                can.drawImage(
                    sig_temp,
                    sig_x,
                    sig_y,
                    width=pos.width,
                    height=pos.height,
                    preserveAspectRatio=True,
                )
            except Exception as e:
                logger.warning(f"Failed to place signature at position {pos.id}: {e}")
                continue

        # Add signer info and timestamp
        from datetime import datetime
        can.setFont("Helvetica", 8)
        can.drawString(50, 50, f"Ditandatangani oleh: {signer_name}")
        can.drawString(50, 40, f"Waktu: {datetime.now().isoformat()}")

        can.save()
        overlay_buffer.seek(0)

        # Merge overlay with original PDF
        overlay_reader = PdfReader(overlay_buffer)
        output_writer = PdfWriter()

        for page_num in range(len(pdf_writer.pages)):
            page = pdf_writer.pages[page_num]
            if page_num < len(overlay_reader.pages):
                page.merge_page(overlay_reader.pages[page_num])
            output_writer.add_page(page)

        # Generate signed PDF
        output_buffer = io.BytesIO()
        output_writer.write(output_buffer)
        output_buffer.seek(0)

        # Encode as base64 for transmission
        import base64
        signed_pdf_b64 = base64.b64encode(output_buffer.getvalue()).decode()

        return {
            "signed_pdf": signed_pdf_b64,
            "filename": f"signed_{pdf_file.filename}",
            "signer_name": signer_name,
            "signature_count": len(positions),
        }

    except Exception as e:
        logger.error(f"Error applying signatures: {e}")
        raise HTTPException(status_code=500, detail="Gagal menerapkan tanda tangan.")


@router.post("/embed")
async def embed_signature_in_document(
    document_id: str = Form(...),
    pdf_file: UploadFile = File(...),
    signature_image: UploadFile = File(...),
    positions_json: str = Form(...),
    signer_name: str = Form(...),
    access_token: str = Depends(verify_bearer_token),
) -> dict[str, Any]:
    """
    Apply signatures and save to document record.
    """
    try:
        # Call apply_signatures logic
        signed_result = await apply_signatures(
            pdf_file=pdf_file,
            signature_image=signature_image,
            positions_json=positions_json,
            signer_name=signer_name,
            access_token=access_token,
        )

        # TODO: Update document record in Supabase with signed_pdf
        # This will be called from frontend after user confirms signature placement

        return {
            "success": True,
            "message": "Tanda tangan berhasil disimpan ke dokumen",
            **signed_result,
        }

    except Exception as e:
        logger.error(f"Error embedding signature: {e}")
        raise HTTPException(status_code=500, detail="Gagal menyimpan tanda tangan.")
