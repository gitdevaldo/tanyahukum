"""Qdrant vector search for RAG retrieval."""
import logging
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, MatchValue
from api.config import settings

logger = logging.getLogger(__name__)

_client: QdrantClient | None = None

COLLECTION = "legal_chunks"


def get_qdrant() -> QdrantClient:
    """Lazy initialization of Qdrant client."""
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.qdrant_url, timeout=30)
    return _client


def vector_search(query_embedding: list[float], top_k: int = 5) -> list[dict]:
    """Search legal_chunks collection using Qdrant vector search.

    Returns top-k matching regulation chunks with metadata.
    """
    top_k = max(1, min(top_k, 20))
    client = get_qdrant()

    results = client.query_points(
        collection_name=COLLECTION,
        query=query_embedding,
        limit=top_k,
        with_payload=True,
    )

    return [
        {
            "content":    hit.payload.get("content", ""),
            "source":     hit.payload.get("source", ""),
            "pasal_ref":  hit.payload.get("pasal_ref", ""),
            "doc_id":     hit.payload.get("doc_id", ""),
            "score":      hit.score,
        }
        for hit in results.points
    ]


def get_chunks_count() -> int:
    """Get total number of chunks in the collection."""
    client = get_qdrant()
    info = client.get_collection(COLLECTION)
    return info.points_count or 0


def check_connection() -> bool:
    """Check if Qdrant is reachable."""
    try:
        client = get_qdrant()
        client.get_collections()
        return True
    except Exception:
        return False
