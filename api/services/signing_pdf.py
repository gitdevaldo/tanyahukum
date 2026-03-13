"""PDF builders for signing certificate and final signed bundle."""
from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def _draw_wrapped_text(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str = "Helvetica",
    font_size: int = 10,
    line_height: float = 14,
) -> float:
    c.setFont(font_name, font_size)
    words = (text or "").split()
    if not words:
        return y - line_height

    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if c.stringWidth(candidate, font_name, font_size) <= max_width:
            line = candidate
            continue
        c.drawString(x, y, line)
        y -= line_height
        line = word
    if line:
        c.drawString(x, y, line)
        y -= line_height
    return y


def build_certificate_pdf(certificate: dict) -> bytes:
    """Render a certificate PDF from certificate payload data."""
    output = BytesIO()
    c = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    margin = 48
    content_width = width - (2 * margin)
    y = height - margin

    c.setTitle("Sertifikat Penandatanganan TanyaHukum")
    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin, y, "Sertifikat Penandatanganan Dokumen")
    y -= 26

    c.setFont("Helvetica", 10)
    c.drawString(margin, y, "Platform: TanyaHukum (prototype consent-based e-sign)")
    y -= 18

    y = _draw_wrapped_text(
        c,
        f"Document ID: {certificate.get('document_id', '-')}",
        margin,
        y,
        content_width,
    )
    y = _draw_wrapped_text(
        c,
        f"Nama Dokumen: {certificate.get('filename', '-')}",
        margin,
        y,
        content_width,
    )
    y = _draw_wrapped_text(
        c,
        f"Status: {certificate.get('status', '-')}",
        margin,
        y,
        content_width,
    )
    y = _draw_wrapped_text(
        c,
        f"Selesai Ditandatangani: {certificate.get('completed_at') or '-'}",
        margin,
        y,
        content_width,
    )
    y -= 10

    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "Riwayat Penandatangan")
    y -= 18

    signatures = certificate.get("signatures", [])
    if not signatures:
        c.setFont("Helvetica", 10)
        c.drawString(margin, y, "Tidak ada data penandatangan.")
        y -= 14

    for idx, sig in enumerate(signatures, start=1):
        if y < 110:
            c.showPage()
            y = height - margin
            c.setFont("Helvetica-Bold", 12)
            c.drawString(margin, y, "Riwayat Penandatangan (lanjutan)")
            y -= 18

        c.setFont("Helvetica-Bold", 10)
        c.drawString(margin, y, f"{idx}. {sig.get('signer_name', '-')}")
        y -= 14
        y = _draw_wrapped_text(
            c,
            f"Email: {sig.get('signer_email', '-')}",
            margin + 14,
            y,
            content_width - 14,
        )
        y = _draw_wrapped_text(
            c,
            f"Signed At: {sig.get('signed_at', '-')}",
            margin + 14,
            y,
            content_width - 14,
        )
        y = _draw_wrapped_text(
            c,
            f"Document Hash: {sig.get('document_hash', '-')}",
            margin + 14,
            y,
            content_width - 14,
        )
        y -= 8

    if y < 100:
        c.showPage()
        y = height - margin

    c.setFont("Helvetica-Oblique", 9)
    c.drawString(
        margin,
        64,
        "Catatan: Sertifikat ini menunjukkan consent-based signature untuk kebutuhan prototype hackathon.",
    )

    c.save()
    return output.getvalue()


def build_signed_document_pdf(original_pdf: bytes, certificate: dict) -> bytes:
    """Append certificate pages to original PDF and return final signed PDF bytes."""
    if not original_pdf:
        raise ValueError("Original PDF is empty.")

    certificate_pdf = build_certificate_pdf(certificate)
    original_reader = PdfReader(BytesIO(original_pdf))
    certificate_reader = PdfReader(BytesIO(certificate_pdf))

    writer = PdfWriter()
    for page in original_reader.pages:
        writer.add_page(page)
    for page in certificate_reader.pages:
        writer.add_page(page)

    writer.add_metadata(
        {
            "/Title": f"Signed Document - {certificate.get('filename', 'document')}",
            "/Producer": "TanyaHukum",
        }
    )

    output = BytesIO()
    writer.write(output)
    return output.getvalue()
