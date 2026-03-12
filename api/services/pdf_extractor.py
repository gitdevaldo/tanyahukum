"""PDF text extraction using pdfplumber."""
import io
import pdfplumber

MAX_PAGES = 20  # H-05: Limit uploaded PDF page count


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber.

    Returns concatenated text from all pages with page markers.
    Raises ValueError if page count exceeds MAX_PAGES.
    """
    pages_text: list[str] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        if len(pdf.pages) > MAX_PAGES:
            raise ValueError(f"PDF terlalu besar: {len(pdf.pages)} halaman (maks {MAX_PAGES})")
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if text and text.strip():
                pages_text.append(f"[Halaman {i}]\n{text.strip()}")

    return "\n\n".join(pages_text)


def get_pdf_info(pdf_bytes: bytes) -> dict:
    """Get basic PDF metadata."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return {
            "pages": len(pdf.pages),
            "metadata": pdf.metadata or {},
        }
