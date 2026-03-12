"""Save and retrieve analysis results + PDFs from MongoDB."""
import logging
from datetime import datetime, timezone
from bson.binary import Binary
from api.services.rag import get_db

logger = logging.getLogger(__name__)

COLLECTION = "analyses"

# Max chat messages per analysis before soft-limit kicks in
CHAT_LIMIT = 10


def save_analysis(analysis_dict: dict, pdf_bytes: bytes) -> None:
    """Save analysis result and original PDF to MongoDB."""
    db = get_db()
    col = db[COLLECTION]

    doc = {
        "_id": analysis_dict["analysis_id"],
        "result": analysis_dict,
        "pdf": Binary(pdf_bytes),
        "chat_count": 0,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        col.insert_one(doc)
        logger.info(f"Saved analysis {doc['_id']} ({len(pdf_bytes)} bytes PDF)")
    except Exception as e:
        logger.error(f"Failed to save analysis: {e}", exc_info=True)


def get_analysis(analysis_id: str) -> dict | None:
    """Retrieve analysis result by ID (without PDF binary), includes remaining chats."""
    db = get_db()
    col = db[COLLECTION]

    doc = col.find_one({"_id": analysis_id}, {"pdf": 0})
    if doc:
        result = doc["result"]
        chat_count = doc.get("chat_count", 0)
        result["remaining_chats"] = max(0, CHAT_LIMIT - chat_count)
        return result
    return None


def get_analysis_pdf(analysis_id: str) -> bytes | None:
    """Retrieve PDF binary by analysis ID."""
    db = get_db()
    col = db[COLLECTION]

    doc = col.find_one({"_id": analysis_id}, {"pdf": 1})
    if doc and "pdf" in doc:
        return bytes(doc["pdf"])
    return None


def get_chat_usage(analysis_id: str) -> tuple[int, int]:
    """Return (current_count, limit) for chat usage on this analysis."""
    db = get_db()
    col = db[COLLECTION]

    doc = col.find_one({"_id": analysis_id}, {"chat_count": 1})
    count = doc.get("chat_count", 0) if doc else 0
    return count, CHAT_LIMIT


def increment_chat_count(analysis_id: str) -> int:
    """Increment chat count and return the new value."""
    db = get_db()
    col = db[COLLECTION]

    result = col.find_one_and_update(
        {"_id": analysis_id},
        {"$inc": {"chat_count": 1}},
        return_document=True,
        projection={"chat_count": 1},
    )
    return result["chat_count"] if result else 0


def try_increment_chat(analysis_id: str, limit: int) -> tuple[bool, int]:
    """Atomically check and increment chat count. Returns (allowed, new_count).

    Uses a single atomic MongoDB operation to prevent race conditions (C-04).
    """
    db = get_db()
    col = db[COLLECTION]

    result = col.find_one_and_update(
        {"_id": analysis_id, "chat_count": {"$lt": limit}},
        {"$inc": {"chat_count": 1}},
        return_document=True,
        projection={"chat_count": 1},
    )
    if result is None:
        doc = col.find_one({"_id": analysis_id}, {"chat_count": 1})
        return False, doc.get("chat_count", limit) if doc else limit
    return True, result["chat_count"]
