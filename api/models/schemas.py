from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime, timezone


class RiskLevel(str, Enum):
    HIGH = "high"       # 🔴
    MEDIUM = "medium"   # 🟡
    LOW = "low"         # 🟢
    SAFE = "safe"       # ✅


class RegulationRef(BaseModel):
    """A matched regulation from RAG."""
    source: str = Field(description="Regulation source filename or title")
    pasal_ref: str = Field(default="", description="Specific pasal/article reference")
    content_snippet: str = Field(default="", description="Relevant text snippet")
    similarity_score: float = Field(default=0.0, description="Cosine similarity score")


class ClauseAnalysis(BaseModel):
    """Analysis result for a single clause."""
    clause_index: int
    clause_text: str
    risk_level: RiskLevel
    risk_score: float = Field(ge=0, le=10, description="Risk score 0-10")
    summary: str = Field(description="Brief explanation of the risk")
    issues: list[str] = Field(default_factory=list, description="Specific issues found")
    recommendations: list[str] = Field(default_factory=list, description="Suggested improvements")
    matched_regulations: list[RegulationRef] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    """Full analysis response for a contract."""
    analysis_id: str
    filename: str
    overall_risk: RiskLevel
    overall_score: float = Field(ge=0, le=10)
    total_clauses: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    safe_count: int
    summary: str
    clauses: list[ClauseAnalysis]
    disclaimer: str = "⚠️ Hasil analisis ini bukan nasihat hukum. Selalu konsultasikan dengan pengacara profesional untuk keputusan hukum."
    analyzed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatRequest(BaseModel):
    """Chat follow-up request."""
    message: str = Field(min_length=1, max_length=2000)
    analysis_id: str | None = Field(default=None, description="ID of analysis for context")
    analysis_context: str | None = Field(default=None, max_length=50000, description="Summary of analysis results for chat context")
    conversation_history: list[ChatMessage] = Field(default_factory=list)


class ChatMessage(BaseModel):
    """A single chat message."""
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatResponse(BaseModel):
    """Chat response."""
    message: str
    disclaimer: str = "Bukan nasihat hukum. Konsultasikan dengan pengacara."
    remaining_chats: int | None = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    service: str = "tanyahukum-api"
    mongodb: str = "unknown"  # kept as "mongodb" for API backward compatibility
    llm: str = "unknown"
    embeddings: str = "unknown"
    chunks_count: int = 0


class RegisterRequest(BaseModel):
    """Register a new end user account."""
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=100)
    account_type: str = Field(default="personal", pattern="^(personal|business)$")
    plan: str = Field(default="free", pattern="^(free|starter|plus|business|enterprise)$")


class RegisterResponse(BaseModel):
    success: bool
    message: str
    user_id: str
    email: str
    email_confirmed: bool


class LoginRequest(BaseModel):
    """Email/password login request."""
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginUser(BaseModel):
    user_id: str
    email: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: LoginUser


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: LoginUser


class LogoutResponse(BaseModel):
    success: bool
    message: str


class QuotaInfo(BaseModel):
    analysis_used: int
    analysis_limit: int | None
    analysis_remaining: int | None
    esign_used: int
    esign_limit: int | None
    esign_remaining: int | None
    chat_per_doc_limit: int
    reset_at: str | None


class AuthMeResponse(BaseModel):
    user_id: str
    email: str
    name: str
    phone: str | None = None
    account_type: str
    plan: str
    company_name: str | None = None
    created_at: str | None = None
    quota: QuotaInfo


class QuotaResponse(BaseModel):
    user_id: str
    account_type: str
    plan: str
    quota: QuotaInfo


class ShareDocumentRequest(BaseModel):
    analysis_id: str | None = None
    filename: str = Field(min_length=1, max_length=255)
    signer_emails: list[EmailStr] = Field(min_length=1, max_length=25)
    company_pays_analysis: bool = False
    expires_at: str | None = None


class ShareDocumentResponse(BaseModel):
    document_id: str
    status: str
    signers_count: int
    message: str


class DocumentSignerInfo(BaseModel):
    email: str
    name: str | None = None
    role: str
    status: str
    signed_at: str | None = None
    rejection_reason: str | None = None


class DocumentSignersResponse(BaseModel):
    document_id: str
    status: str
    company_pays_analysis: bool
    expires_at: str | None = None
    signers: list[DocumentSignerInfo]


class DocumentAnalysisResponse(BaseModel):
    document_id: str
    analysis_id: str
    company_pays_analysis: bool
    analysis: AnalysisResponse


class SignDocumentRequest(BaseModel):
    signer_name: str = Field(min_length=2, max_length=120)
    consent_text: str = Field(min_length=5, max_length=3000)
    document_hash: str = Field(min_length=16, max_length=256)


class RejectDocumentRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class DocumentActionResponse(BaseModel):
    success: bool
    document_id: str
    status: str
    message: str


class SignatureRecord(BaseModel):
    signer_email: str
    signer_name: str
    document_hash: str
    signed_at: str


class CertificateResponse(BaseModel):
    document_id: str
    filename: str
    status: str
    completed_at: str | None = None
    certificate_pdf_url: str | None = None
    signed_pdf_url: str | None = None
    signatures: list[SignatureRecord]


class DocumentEventInfo(BaseModel):
    id: str
    event_type: str
    actor_email: str | None = None
    request_id: str | None = None
    metadata: dict
    created_at: str


class DocumentEventsResponse(BaseModel):
    document_id: str
    events: list[DocumentEventInfo]
