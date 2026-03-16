"""Save and retrieve analysis results + PDFs from Qdrant."""
import base64
import logging
from datetime import datetime, timezone
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue
from api.services.rag import get_qdrant

logger = logging.getLogger(__name__)

COLLECTION = "analyses"
CHAT_LIMIT = 10


def _find_analysis_point(analysis_id: str) -> tuple[int | None, dict | None]:
    """Find analysis point by analysis_id in payload. Returns (point_id, payload) or (None, None)."""
    client = get_qdrant()
    results = client.scroll(
        collection_name=COLLECTION,
        scroll_filter=Filter(must=[
            FieldCondition(key="analysis_id", match=MatchValue(value=analysis_id))
        ]),
        limit=1,
        with_payload=True,
    )
    points = results[0]
    if points:
        return points[0].id, points[0].payload
    return None, None


def save_analysis(analysis_dict: dict, pdf_bytes: bytes | None = None) -> None:
    """Save analysis result and optional original PDF to Qdrant."""
    client = get_qdrant()

    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8") if pdf_bytes else None

    # Get next ID
    info = client.get_collection(COLLECTION)
    next_id = (info.points_count or 0)

    payload = {
        "analysis_id": analysis_dict["analysis_id"],
        "result":      analysis_dict,
        "pdf_b64":     pdf_b64,
        "chat_count":  0,
        "created_at":  datetime.now(timezone.utc).isoformat(),
    }

    try:
        client.upsert(
            collection_name=COLLECTION,
            points=[PointStruct(id=next_id, vector=[0.0, 0.0, 0.0, 0.0], payload=payload)],
        )
        logger.info(
            f"Saved analysis {analysis_dict['analysis_id']} "
            f"({len(pdf_bytes) if pdf_bytes else 0} bytes PDF)"
        )
    except Exception as e:
        logger.error(f"Failed to save analysis: {e}", exc_info=True)


def get_analysis(analysis_id: str) -> dict | None:
    """Retrieve analysis result by ID (without PDF binary), includes remaining chats."""
    point_id, payload = _find_analysis_point(analysis_id)
    if payload:
        result = payload["result"]
        chat_count = payload.get("chat_count", 0)
        result["remaining_chats"] = max(0, CHAT_LIMIT - chat_count)
        return result
    return None


def get_analysis_pdf(analysis_id: str) -> bytes | None:
    """Retrieve PDF binary by analysis ID."""
    _, payload = _find_analysis_point(analysis_id)
    if payload and payload.get("pdf_b64"):
        return base64.b64decode(payload["pdf_b64"])
    return None


def get_chat_usage(analysis_id: str) -> tuple[int, int]:
    """Return (current_count, limit) for chat usage on this analysis."""
    _, payload = _find_analysis_point(analysis_id)
    count = payload.get("chat_count", 0) if payload else 0
    return count, CHAT_LIMIT


def increment_chat_count(analysis_id: str) -> int:
    """Increment chat count and return the new value."""
    client = get_qdrant()
    point_id, payload = _find_analysis_point(analysis_id)
    if point_id is None or payload is None:
        return 0

    new_count = payload.get("chat_count", 0) + 1
    client.set_payload(
        collection_name=COLLECTION,
        payload={"chat_count": new_count},
        points=[point_id],
    )
    return new_count


def try_increment_chat(analysis_id: str, limit: int) -> tuple[bool, int]:
    """Check and increment chat count. Returns (allowed, new_count)."""
    client = get_qdrant()
    point_id, payload = _find_analysis_point(analysis_id)
    if point_id is None or payload is None:
        return False, limit

    current = payload.get("chat_count", 0)
    if current >= limit:
        return False, current

    new_count = current + 1
    client.set_payload(
        collection_name=COLLECTION,
        payload={"chat_count": new_count},
        points=[point_id],
    )
    return True, new_count
