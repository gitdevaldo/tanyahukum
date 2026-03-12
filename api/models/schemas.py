from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field
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
    mongodb: str = "unknown"
    llm: str = "unknown"
    embeddings: str = "unknown"
    chunks_count: int = 0
