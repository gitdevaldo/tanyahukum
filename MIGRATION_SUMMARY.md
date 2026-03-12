# MongoDB → Qdrant Migration: Quick Reference

## System Status
- **Docker**: ❌ Not installed
- **Disk Space**: ✅ 216GB available (31% used)
- **Repository Size**: 9.4GB (29 Python files)

## Files to Modify (Priority Order)

### CRITICAL - Database Layer
| File | Lines | Changes |
|------|-------|---------|
| `api/config.py` | 11-13, 34, 55-58 | Replace MONGODB_URI/MONGODB_DB with Qdrant config; update BSON limit comment |
| `api/services/rag.py` | 1-77 | Replace MongoClient, rewrite vector_search() with Qdrant API |
| `api/services/storage.py` | 1-102 | Replace MongoDB operations with Qdrant payloads; handle binary PDF storage |
| `scripts/ingest.py` | 28-29, 46-47, 519-545 | Replace MongoClient; rewrite bulk ingestion (121K+ chunks) |
| `.env` | 1-3 | Replace MONGODB_URI/MONGODB_DB with Qdrant credentials |
| `api/requirements.txt` | pymongo==4.16.0 | Remove pymongo; add qdrant-client>=2.4.0 |

### HIGH - API Layer
| File | Lines | Changes |
|------|-------|---------|
| `api/routers/booking.py` | 52-68 | Replace db["consultation_bookings"].insert_one() |
| `api/routers/health.py` | 26-40 | Update MongoDB health check → Qdrant |
| `api/main.py` | 27-40 | Update graceful shutdown (MongoDB → Qdrant) |

### MEDIUM - Routers
| File | Lines | Changes |
|------|-------|---------|
| `api/routers/analyze.py` | 48 | Calls save_analysis() (storage.py) |
| `api/routers/chat.py` | 31 | Calls try_increment_chat() (storage.py) |

---

## Collections to Migrate

### 1. `legal_chunks` (121K+ documents, ~4GB)
**Purpose**: Regulation chunks with vector embeddings  
**Key Fields**:
- `embedding`: vector (1024-dim, cosine similarity)
- `content`: string (regulation text)
- `source`: string (regulation name)
- `pasal_ref`: string (section reference)
- `category`, `doc_id`, `chunk_index`: metadata

**Migration Steps**:
1. Create Qdrant collection with vector_size=1024, distance="Cosine"
2. Batch upsert all 121K+ documents with embeddings
3. Update `rag.py` search_points() call

### 2. `analyses` (Analysis Results + PDF Binary)
**Purpose**: Store contract analysis results and PDFs  
**Key Fields**:
- `_id` (analysis_id)
- `result` (analysis JSON)
- `pdf` (binary PDF)
- `chat_count` (for rate limiting)
- `created_at` (timestamp)

**Migration Steps**:
1. Create Qdrant collection (payload-only)
2. Decide: Keep PDFs in Qdrant (base64) or external storage (S3/GCS)
3. Migrate all documents with payloads
4. **⚠️ CRITICAL**: Handle atomic chat_count increments (no $inc in Qdrant)

### 3. `consultation_bookings` (Simple Key-Value)
**Purpose**: Lawyer consultation requests  
**Key Fields**:
- `name`, `email`, `whatsapp`: contact info
- `analysis_id`: FK to analyses
- `status`: booking status
- `created_at`: timestamp

**Migration Steps**:
1. Create Qdrant collection (payload-only)
2. Simple upsert of all documents
3. Ensure analysis_id references are valid

---

## Critical Issues to Resolve

### 1. ⚠️ Atomic Operations (Race Condition - C-04)
**Problem**: MongoDB's `find_one_and_update($inc)` is atomic; Qdrant is not  
**Affected**: `storage.py` lines 75-81, 92-101 (chat_count increment)  
**Solutions**:
- [ ] Implement Redis-backed advisory locks
- [ ] Add distributed mutex for chat_count
- [ ] Accept eventual consistency
- [ ] Use application-level locking (threading.Lock)

### 2. ⚠️ Binary Data Storage
**Problem**: Storing PDF binaries in MongoDB; Qdrant payloads have size limits  
**Affected**: `storage.py` lines 15-32 (save_analysis)  
**Solutions**:
- [ ] Store PDFs as base64 in Qdrant payloads
- [ ] Move PDFs to S3/GCS, store URLs in Qdrant
- [ ] Use hybrid approach (small PDFs in Qdrant, large in S3)

### 3. ⚠️ Async vs Sync Client
**Problem**: Current code uses asyncio.to_thread() for MongoDB; Qdrant offers async  
**Options**:
- [ ] Use QdrantClient (sync) - simpler, maintains current pattern
- [ ] Use AsyncQdrantClient (async) - better concurrency
- [ ] Recommendation: Use **QdrantClient** (sync) to minimize changes

---

## Import Changes Required

```python
# Remove:
from pymongo import MongoClient
from pymongo.operations import InsertOne
from bson.binary import Binary

# Add:
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
```

---

## Estimated Scope

- **Files Modified**: 8 core files
- **Lines Changed**: ~200+ lines
- **Tests Needed**: 10+ (vector search, bulk ingestion, atomic ops)
- **Data Migration**: 121K+ documents + historical analyses
- **Complexity**: MEDIUM-HIGH (atomic operations, bulk ingestion)

---

## Next Steps

1. **Install Qdrant** (Docker or managed cloud)
2. **Update Configuration** (.env, config.py)
3. **Rewrite RAG Layer** (rag.py vector search)
4. **Migrate Storage Layer** (storage.py payloads)
5. **Batch Ingest Data** (121K chunks + analyses)
6. **Handle Atomicity** (chat_count, bookings)
7. **Test & Validate** (all collections, API endpoints)
8. **Deploy & Monitor** (production readiness)

---

**Full Details**: See `MIGRATION_PLAN.txt` for complete line-by-line analysis.
