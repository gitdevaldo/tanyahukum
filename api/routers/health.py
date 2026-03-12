"""GET /api/health — Health check endpoint."""
import asyncio
import logging
from fastapi import APIRouter
from api.models.schemas import HealthResponse
from api.services.rag import check_connection, get_chunks_count
from api.services.embeddings import embed_single
from api.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _check_embeddings() -> bool:
    """Quick connectivity test for Mistral embeddings API."""
    try:
        vec = embed_single("test")
        return len(vec) == settings.embed_dimensions
    except Exception as e:
        logger.warning(f"Embeddings health check failed: {e}")
        return False


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health: Qdrant, LLM, embeddings."""
    qdrant_ok = await asyncio.to_thread(check_connection)
    chunks = await asyncio.to_thread(get_chunks_count) if qdrant_ok else 0
    embed_ok = await asyncio.to_thread(_check_embeddings)

    all_ok = qdrant_ok and embed_ok

    return HealthResponse(
        status="ok" if all_ok else "degraded",
        service="tanyahukum-api",
        mongodb="connected" if qdrant_ok else "disconnected",
        llm=f"{settings.do_model} via DO Gradient",
        embeddings=f"mistral-embed ({'ok' if embed_ok else 'error'})",
        chunks_count=chunks,
    )
