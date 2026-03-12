"""GET /api/health — Health check endpoint."""
import asyncio
from fastapi import APIRouter
from api.models.schemas import HealthResponse
from api.services.rag import check_connection, get_chunks_count
from api.config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health: MongoDB, LLM, embeddings."""
    mongo_ok = await asyncio.to_thread(check_connection)
    chunks = await asyncio.to_thread(get_chunks_count) if mongo_ok else 0

    return HealthResponse(
        status="ok" if mongo_ok else "degraded",
        service="tanyahukum-api",
        mongodb="connected" if mongo_ok else "disconnected",
        llm=f"{settings.do_model} via DO Gradient",
        embeddings=f"mistral-embed ({settings.embed_dimensions}d)",
        chunks_count=chunks,
    )
