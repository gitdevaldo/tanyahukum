"""Guardrails for input validation, output grounding, and chat topic enforcement."""
import re
from api.models.schemas import ClauseAnalysis, RegulationRef, RiskLevel

# Maximum file size in bytes
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

LEGAL_DISCLAIMER_ID = (
    "⚠️ Hasil analisis ini bukan nasihat hukum. "
    "Selalu konsultasikan dengan pengacara profesional untuk keputusan hukum."
)

CHAT_DISCLAIMER_ID = "Bukan nasihat hukum. Konsultasikan dengan pengacara."

CHAT_LIMIT_RESPONSE = (
    "Terima kasih telah menggunakan layanan analisis TanyaHukum. "
    "Batas konsultasi AI untuk dokumen ini telah tercapai.\n\n"
    "Untuk pemahaman lebih mendalam mengenai kontrak Anda, kami sangat "
    "menyarankan untuk berkonsultasi langsung dengan konsultan hukum profesional "
    "yang dapat memberikan nasihat hukum yang lebih spesifik dan mengikat.\n\n"
    "Hubungi tim konsultan hukum kami melalui halaman utama TanyaHukum "
    "untuk menjadwalkan konsultasi."
)

# Topics the chatbot is allowed to discuss
ALLOWED_TOPICS = [
    "kontrak", "perjanjian", "hukum", "pasal", "regulasi", "peraturan",
    "undang-undang", "klausul", "risiko", "analisis", "legal", "hak",
    "kewajiban", "pelanggaran", "sanksi", "bab", "ayat", "perdata",
    "pidana", "ojk", "bi", "bpk", "otoritas", "kepatuhan", "compliance",
    "force majeure", "wanprestasi", "ganti rugi", "arbitrase", "sengketa",
    "pkwt", "pkwtt", "ketenagakerjaan", "tenaga kerja", "upah", "phk",
    "pinjaman", "kredit", "bunga", "jaminan", "agunan", "fidusia",
]

CHAT_SYSTEM_PROMPT = """Kamu adalah TanyaHukum AI Assistant, asisten analisis kontrak hukum Indonesia.

ATURAN KETAT:
1. Kamu HANYA boleh menjawab pertanyaan terkait:
   - Kontrak/perjanjian yang sedang dianalisis
   - Hukum dan regulasi Indonesia
   - Istilah-istilah hukum
   - Hasil analisis yang telah dilakukan
2. Jika pengguna bertanya di luar topik hukum/kontrak, jawab dengan sopan:
   "Maaf, saya hanya bisa membantu terkait analisis kontrak dan hukum Indonesia. Apakah ada pertanyaan tentang kontrak Anda?"
3. JANGAN PERNAH memberikan nasihat hukum definitif. Gunakan bahasa seperti:
   - "Berdasarkan analisis..." bukan "Anda harus..."
   - "Terdapat indikasi risiko..." bukan "Ini ilegal..."
   - "Disarankan untuk berkonsultasi..." bukan "Anda wajib..."
4. JANGAN PERNAH membuat dokumen hukum (kontrak, surat kuasa, dll).
5. Selalu sertakan referensi pasal/regulasi jika membahas hukum spesifik.
6. Jawab dalam Bahasa Indonesia kecuali pengguna menggunakan bahasa lain.

FORMAT JAWABAN — SANGAT PENTING:
- Jawab dalam paragraf biasa yang mudah dibaca.
- JANGAN gunakan markdown: JANGAN gunakan #, ##, **, *, ---, >, ```, atau format markdown lainnya.
- JANGAN gunakan emoji.
- Untuk membuat poin-poin, gunakan angka biasa (1, 2, 3) atau tanda strip (-) saja.
- Tulis jawaban yang ringkas dan langsung ke inti. Jangan bertele-tele.
"""


def validate_pdf_upload(file_bytes: bytes, filename: str) -> tuple[bool, str]:
    """Validate uploaded PDF file.

    Returns (is_valid, error_message).
    """
    if len(file_bytes) > MAX_FILE_SIZE:
        return False, f"File terlalu besar ({len(file_bytes) / 1024 / 1024:.1f}MB). Maksimum {MAX_FILE_SIZE // 1024 // 1024}MB."

    if not filename.lower().endswith(".pdf"):
        return False, "Hanya file PDF yang didukung."

    # Check PDF magic bytes
    if not file_bytes[:5] == b'%PDF-':
        return False, "File bukan PDF yang valid."

    if len(file_bytes) < 100:
        return False, "File PDF terlalu kecil/kosong."

    return True, ""


def validate_extracted_text(text: str) -> tuple[bool, str]:
    """Validate that extracted text looks like a legal document."""
    if not text or len(text.strip()) < 100:
        return False, "Teks dokumen tidak cukup untuk dianalisis. Pastikan dokumen berisi teks yang terbaca."

    return True, ""


def ground_citations(clause: ClauseAnalysis, rag_results: list[dict]) -> ClauseAnalysis:
    """Verify that cited regulations actually exist in RAG results.

    Remove or flag any hallucinated citations.
    """
    rag_sources = set()
    for r in rag_results:
        rag_sources.add(r.get("source", ""))
        if r.get("pasal_ref"):
            rag_sources.add(r["pasal_ref"])

    grounded_refs = []
    for ref in clause.matched_regulations:
        if ref.source in rag_sources or ref.pasal_ref in rag_sources:
            grounded_refs.append(ref)
        # If not found, we still keep it but mark similarity as 0
        else:
            ref.similarity_score = 0.0
            grounded_refs.append(ref)

    clause.matched_regulations = grounded_refs
    return clause


def is_on_topic(message: str) -> bool:
    """Check if a chat message is related to legal/contract topics.

    Uses keyword matching as a lightweight pre-filter.
    """
    message_lower = message.lower()

    # Always allow greetings and follow-ups
    greetings = ["halo", "hai", "hi", "terima kasih", "thanks", "ok", "oke", "ya", "tidak", "lanjut"]
    if any(message_lower.strip() == g for g in greetings):
        return True

    # Check for legal topic keywords
    for topic in ALLOWED_TOPICS:
        if topic in message_lower:
            return True

    # Check for references to analysis results
    analysis_refs = ["hasil", "skor", "risiko", "klausa", "bagian", "pasal", "analisis", "dokumen"]
    if any(ref in message_lower for ref in analysis_refs):
        return True

    # Short follow-up questions are usually on-topic
    if len(message.split()) <= 5:
        return True

    return False


def build_chat_system_prompt(analysis_context: str | None = None) -> str:
    """Build the system prompt for chat, optionally including analysis context."""
    prompt = CHAT_SYSTEM_PROMPT

    if analysis_context:
        prompt += f"\n\nKONTEKS ANALISIS SEBELUMNYA:\n{analysis_context}"

    return prompt
