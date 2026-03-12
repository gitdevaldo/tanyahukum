"""PDF text extraction using pdfplumber."""
import io
import pdfplumber
from typing import Optional


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber.

    Returns concatenated text from all pages with page markers.
    """
    pages_text: list[str] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if text and text.strip():
                pages_text.append(f"[Halaman {i}]\n{text.strip()}")

    return "\n\n".join(pages_text)


def extract_tables_from_pdf(pdf_bytes: bytes) -> list[list[list[Optional[str]]]]:
    """Extract tables from PDF bytes. Returns list of tables, each a list of rows."""
    tables = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_tables = page.extract_tables()
            if page_tables:
                tables.extend(page_tables)
    return tables


def get_pdf_info(pdf_bytes: bytes) -> dict:
    """Get basic PDF metadata."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return {
            "pages": len(pdf.pages),
            "metadata": pdf.metadata or {},
        }
