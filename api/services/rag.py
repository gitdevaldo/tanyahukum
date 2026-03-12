"""MongoDB vector search for RAG retrieval."""
from pymongo import MongoClient
from api.config import settings

_client = None
_db = None


def get_db():
    """Get cached MongoDB database connection."""
    global _client, _db
    if _db is None:
        _client = MongoClient(settings.mongodb_uri)
        _db = _client[settings.mongodb_db]
    return _db


def vector_search(query_embedding: list[float], top_k: int = 5) -> list[dict]:
    """Search legal_chunks collection using MongoDB Atlas vector search.

    Returns top-k matching regulation chunks with metadata.
    """
    db = get_db()
    collection = db["legal_chunks"]

    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": query_embedding,
                "numCandidates": top_k * 10,
                "limit": top_k,
            }
        },
        {
            "$project": {
                "content": 1,
                "source": 1,
                "pasal_ref": 1,
                "category": 1,
                "doc_id": 1,
                "chunk_index": 1,
                "score": {"$meta": "vectorSearchScore"},
                "_id": 0,
            }
        },
    ]

    results = list(collection.aggregate(pipeline))
    return results


def get_chunks_count() -> int:
    """Get total number of chunks in the collection."""
    db = get_db()
    return db["legal_chunks"].estimated_document_count()


def check_connection() -> bool:
    """Check if MongoDB is reachable."""
    try:
        db = get_db()
        db.command("ping")
        return True
    except Exception:
        return False
