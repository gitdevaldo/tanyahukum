# MongoDB → Qdrant Migration: Complete Documentation Index

## Overview
This directory contains comprehensive migration guides for converting TanyaHukum from MongoDB to Qdrant vector database.

**Migration Scope**: 8 files, ~200+ lines of code changes, 3 collections (121K+ documents)

---

## 📄 Documentation Files

### 1. **MIGRATION_SUMMARY.md** (Quick Reference - Start Here!)
**Best for**: Quick overview, getting started, high-level planning  
**Contains**:
- System status (Docker: ❌, Disk: 216GB ✅)
- Files to modify by priority (CRITICAL, HIGH, MEDIUM)
- 3 collections to migrate (legal_chunks, analyses, consultation_bookings)
- 3 critical issues to resolve
- Import changes required
- Estimated scope and next steps

**Read this first** to understand the big picture.

---

### 2. **MIGRATION_PLAN.txt** (Comprehensive Analysis)
**Best for**: Complete understanding, detailed requirements  
**Contains**:
- Configuration files (MongoDB_URI, config.py, .env)
- MongoDB imports and usage by file
- Collection references with schemas
- MongoDB operations by type (vector search, insert, find, atomic updates)
- Initialization & lifecycle management
- Health check integration
- Dependency injection patterns
- Migration summary table
- Critical migration concerns (binary data, atomic ops, async/await)
- Testing checklist

**Use this** for in-depth understanding of all touchpoints.

---

### 3. **MIGRATION_CODE_LOCATIONS.txt** (Line-by-Line Reference)
**Best for**: Implementation, copy-paste code changes  
**Contains**:
- **Exact line numbers** for every MongoDB usage
- **Current code** for each section
- **Replacement code** for Qdrant
- 7 sections covering all files:
  1. Configuration & Environment
  2. RAG Vector Search Layer
  3. Storage Layer (Analyses & Chat Counting)
  4. Consultation Bookings Router
  5. Health Check Endpoint
  6. App Lifecycle (Graceful Shutdown)
  7. Ingestion Script (121K+ Chunks)

**Use this** while implementing changes in your IDE.

---

## 🎯 Files That Need Modification

### Priority: CRITICAL
| File | Why | Lines | Effort |
|------|-----|-------|--------|
| `.env` | Database credentials | 1-3 | 5 min |
| `api/config.py` | Configuration validation | 11-13, 34, 55-58 | 15 min |
| `api/services/rag.py` | Vector search engine | 1-77 | 45 min |
| `api/services/storage.py` | Data persistence layer | 1-102 | 60 min |
| `scripts/ingest.py` | Bulk ingestion (121K docs) | 28-29, 46-47, 519-545, 739 | 45 min |
| `api/requirements.txt` | Dependencies | pymongo line | 5 min |

### Priority: HIGH
| File | Why | Lines | Effort |
|------|-----|-------|--------|
| `api/routers/booking.py` | Consultation storage | 52-68 | 15 min |
| `api/routers/health.py` | Health checks | 26-40 | 15 min |
| `api/main.py` | Graceful shutdown | 27-40 | 10 min |

### Priority: MEDIUM
| File | Why | Lines | Effort |
|------|-----|-------|--------|
| `api/routers/analyze.py` | Uses storage functions | 48 | 0 min (inherited) |
| `api/routers/chat.py` | Uses storage functions | 31 | 0 min (inherited) |

**Total Estimated Time**: ~3-4 hours for implementation + testing

---

## 📊 Collections to Migrate

### 1. `legal_chunks` (121K+ documents, ~4GB)
- **Purpose**: Regulation chunks with vector embeddings
- **Vector Size**: 1024 dimensions, Cosine similarity
- **Read-Heavy**: Searched on every analysis
- **Action**: Batch upsert with embeddings
- **Docs**: See MIGRATION_PLAN.txt § 9.3

### 2. `analyses` (Analysis Results)
- **Purpose**: Store contract analysis + PDF binary
- **Special Handling**: Binary PDF storage, atomic chat counters
- **⚠️ Critical Issue**: No atomic $inc operator in Qdrant
- **Action**: Implement Redis locks or accept eventual consistency
- **Docs**: See MIGRATION_PLAN.txt § 9.4

### 3. `consultation_bookings` (Booking Records)
- **Purpose**: Lawyer consultation requests
- **Simple**: Key-value payload storage, no vectors needed
- **Action**: Simple upsert migration
- **Docs**: See MIGRATION_PLAN.txt § 9.5

---

## ⚠️ Critical Issues to Resolve

### 1. Atomic Operations (Race Condition - C-04)
**Problem**: MongoDB's `find_one_and_update($inc)` is atomic; Qdrant is NOT
**Affected Code**: `api/services/storage.py` lines 75-81, 92-101
**Impact**: Chat count race conditions
**Solutions**:
- [ ] Redis-backed advisory locks (recommended)
- [ ] Application-level mutex (threading.Lock)
- [ ] Accept eventual consistency

See: **MIGRATION_PLAN.txt § 9.1**

### 2. Binary PDF Storage
**Problem**: PDF binaries up to 20MB; Qdrant payloads have size limits
**Affected Code**: `api/services/storage.py` lines 15-32
**Impact**: Data loss if not handled properly
**Solutions**:
- [ ] Base64 encode PDFs in Qdrant payload
- [ ] Move PDFs to S3/GCS, store URLs in Qdrant
- [ ] Hybrid approach (small PDFs in Qdrant, large in S3)

See: **MIGRATION_PLAN.txt § 9.2**

### 3. Async vs Sync Client
**Problem**: Current code uses `asyncio.to_thread()` for MongoDB
**Options**:
- [ ] Use QdrantClient (sync) - simpler, maintains current pattern ✅ RECOMMENDED
- [ ] Use AsyncQdrantClient (async) - better concurrency

See: **MIGRATION_PLAN.txt § 9.4**

---

## 🚀 Quick Start Checklist

- [ ] Read **MIGRATION_SUMMARY.md** (10 min)
- [ ] Review **MIGRATION_PLAN.txt** § 1-4 (20 min)
- [ ] Set up Qdrant instance (Docker or cloud)
- [ ] Update `.env` with Qdrant credentials
- [ ] Modify `api/config.py` (CRITICAL)
- [ ] Rewrite `api/services/rag.py` (CRITICAL) - use **MIGRATION_CODE_LOCATIONS.txt**
- [ ] Rewrite `api/services/storage.py` (CRITICAL) - use **MIGRATION_CODE_LOCATIONS.txt**
- [ ] Update remaining files (booking, health, main)
- [ ] Update `api/requirements.txt`
- [ ] Update `scripts/ingest.py` for bulk migration
- [ ] Implement Redis locks for chat_count atomicity
- [ ] Test vector search accuracy
- [ ] Test bulk ingestion (121K chunks)
- [ ] Deploy and monitor

---

## 🔍 How to Use These Files

### For Planning
1. Start with **MIGRATION_SUMMARY.md**
2. Read full **MIGRATION_PLAN.txt** for details
3. Review testing checklist

### For Implementation
1. Open **MIGRATION_CODE_LOCATIONS.txt** section by section
2. Copy current code snippets
3. Copy replacement code snippets
4. Test each module as you go
5. Refer back to MIGRATION_PLAN.txt for context

### For Troubleshooting
- **Vector search issues**: See MIGRATION_CODE_LOCATIONS.txt § 2
- **Atomic operation issues**: See MIGRATION_PLAN.txt § 9.1
- **Binary data issues**: See MIGRATION_PLAN.txt § 9.2
- **Ingestion performance**: See MIGRATION_CODE_LOCATIONS.txt § 7

---

## 📋 Additional Resources

### Docker Installation (Currently Missing)
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io

# Verify
docker --version
docker run hello-world
```

### Qdrant Deployment Options
1. **Local Docker**:
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```

2. **Managed Cloud** (Recommended for production):
   - Qdrant Cloud (official)
   - AWS, GCP, Azure Marketplace

3. **Docker Compose** (See `docker-compose.yml` if needed)

### Testing Commands
```bash
# Test Qdrant connection
python -c "from qdrant_client import QdrantClient; c = QdrantClient('http://localhost:6333'); print(c.get_collections())"

# Test vector search
python scripts/test_qdrant_search.py

# Bulk ingest test
python scripts/ingest.py --stats
```

---

## 📞 Summary Statistics

| Metric | Value |
|--------|-------|
| Files to modify | 8 |
| Lines of code changes | ~200+ |
| Collections | 3 |
| Total documents | 121K+ (legal_chunks) + N (analyses) |
| Vector dimensions | 1024 (Mistral embeddings) |
| Estimated effort | 3-4 hours |
| Complexity level | MEDIUM-HIGH |
| Risk areas | Atomic operations, binary storage, bulk ingestion |

---

## 🎓 Learning Resources

- [Qdrant Python Client Docs](https://qdrant.tech/documentation/clients/python/)
- [Vector Search Best Practices](https://qdrant.tech/documentation/concepts/search/)
- [Payload Storage Guide](https://qdrant.tech/documentation/concepts/payloads/)
- [Batch Operations](https://qdrant.tech/documentation/concepts/updating-payloads/)

---

**Last Updated**: 2024-03-12  
**Total Documentation**: 1,375 lines across 3 files  
**Status**: Ready for implementation
