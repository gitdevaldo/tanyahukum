"""
Migrate all MongoDB data to Qdrant.

Collections migrated:
  1. legal_chunks (121K+ docs with 1024-dim vectors) → qdrant collection "legal_chunks"
  2. analyses (analysis results + PDF binary)         → qdrant collection "analyses"
  3. consultation_bookings                            → qdrant collection "bookings"

USAGE:
  python3 scripts/migrate_mongo_to_qdrant.py              # full migration
  python3 scripts/migrate_mongo_to_qdrant.py --dry-run    # count docs only
  python3 scripts/migrate_mongo_to_qdrant.py --collection legal_chunks  # migrate one collection
"""

import os
import sys
import time
import argparse
import base64
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from pymongo import MongoClient
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    CollectionInfo, PayloadSchemaType,
)

try:
    from rich.console import Console
    from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
    console = Console()
except ImportError:
    print("pip install rich")
    sys.exit(1)

# ── Config ──
MONGODB_URI  = os.getenv("MONGODB_URI")
MONGODB_DB   = os.getenv("MONGODB_DB", "tanyahukum")
QDRANT_URL   = os.getenv("QDRANT_URL", "http://localhost:6333")

BATCH_SIZE = 100  # points per upsert batch


def get_mongo():
    client = MongoClient(MONGODB_URI)
    return client[MONGODB_DB], client


def get_qdrant():
    return QdrantClient(url=QDRANT_URL, timeout=60)


# ================================================================
# MIGRATE legal_chunks (with vectors)
# ================================================================

def migrate_legal_chunks(qdrant: QdrantClient, db, dry_run=False):
    col = db["legal_chunks"]
    total = col.estimated_document_count()
    console.print(f"\n[bold blue]legal_chunks[/bold blue]: {total} documents")

    if dry_run:
        return

    # Create collection with vector config
    collections = [c.name for c in qdrant.get_collections().collections]
    if "legal_chunks" in collections:
        console.print("  [yellow]Collection exists — dropping and recreating[/yellow]")
        qdrant.delete_collection("legal_chunks")

    qdrant.create_collection(
        collection_name="legal_chunks",
        vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    )
    console.print("  ✅ Created Qdrant collection 'legal_chunks'")

    # Migrate in batches
    cursor = col.find({}, no_cursor_timeout=True).batch_size(BATCH_SIZE)
    points = []
    migrated = 0
    skipped = 0
    point_counter = 0

    with Progress(
        SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
        BarColumn(), TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(), console=console
    ) as progress:
        task = progress.add_task("Migrating legal_chunks", total=total)

        for doc in cursor:
            embedding = doc.get("embedding")
            if not embedding or len(embedding) != 1024:
                skipped += 1
                progress.advance(task)
                continue

            # Use MongoDB _id as string point ID (Qdrant needs str or int)
            point_id = str(doc["_id"])

            payload = {
                "doc_id":     doc.get("doc_id", ""),
                "pasal_ref":  doc.get("pasal_ref", ""),
                "content":    doc.get("content", ""),
                "source":     doc.get("source", ""),
                "bentuk":     doc.get("bentuk", ""),
                "nomor":      doc.get("nomor", ""),
                "tahun":      doc.get("tahun", ""),
                "subjek":     doc.get("subjek", ""),
                "chunk_type": doc.get("chunk_type", ""),
                "created_at": doc.get("created_at", ""),
            }

            points.append(PointStruct(
                id=point_counter,  # sequential integer IDs
                vector=embedding,
                payload=payload,
            ))
            point_counter += 1

            if len(points) >= BATCH_SIZE:
                qdrant.upsert(collection_name="legal_chunks", points=points)
                migrated += len(points)
                points = []

            progress.advance(task)

        # Flush remaining
        if points:
            qdrant.upsert(collection_name="legal_chunks", points=points)
            migrated += len(points)

    cursor.close()
    console.print(f"  ✅ Migrated: {migrated} | Skipped: {skipped}")


# ================================================================
# MIGRATE analyses (no vectors — payload only)
# ================================================================

def migrate_analyses(qdrant: QdrantClient, db, dry_run=False):
    col = db["analyses"]
    total = col.count_documents({})
    console.print(f"\n[bold blue]analyses[/bold blue]: {total} documents")

    if dry_run or total == 0:
        return

    collections = [c.name for c in qdrant.get_collections().collections]
    if "analyses" in collections:
        console.print("  [yellow]Collection exists — dropping and recreating[/yellow]")
        qdrant.delete_collection("analyses")

    # No vectors needed — use a dummy 1-dim vector
    qdrant.create_collection(
        collection_name="analyses",
        vectors_config=VectorParams(size=4, distance=Distance.COSINE),
    )
    console.print("  ✅ Created Qdrant collection 'analyses'")

    points = []
    for i, doc in enumerate(col.find({})):
        analysis_id = str(doc["_id"])

        # Encode PDF binary as base64 string for storage
        pdf_data = doc.get("pdf")
        pdf_b64 = base64.b64encode(bytes(pdf_data)).decode("utf-8") if pdf_data else ""

        payload = {
            "analysis_id": analysis_id,
            "result":      doc.get("result", {}),
            "pdf_b64":     pdf_b64,
            "chat_count":  doc.get("chat_count", 0),
            "created_at":  doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
        }

        points.append(PointStruct(
            id=i,
            vector=[0.0, 0.0, 0.0, 0.0],  # dummy vector
            payload=payload,
        ))

    qdrant.upsert(collection_name="analyses", points=points)
    console.print(f"  ✅ Migrated: {len(points)} analyses")


# ================================================================
# MIGRATE consultation_bookings (no vectors — payload only)
# ================================================================

def migrate_bookings(qdrant: QdrantClient, db, dry_run=False):
    col = db["consultation_bookings"]
    total = col.count_documents({})
    console.print(f"\n[bold blue]consultation_bookings[/bold blue]: {total} documents")

    if dry_run or total == 0:
        return

    collections = [c.name for c in qdrant.get_collections().collections]
    if "bookings" in collections:
        console.print("  [yellow]Collection exists — dropping and recreating[/yellow]")
        qdrant.delete_collection("bookings")

    qdrant.create_collection(
        collection_name="bookings",
        vectors_config=VectorParams(size=4, distance=Distance.COSINE),
    )
    console.print("  ✅ Created Qdrant collection 'bookings'")

    points = []
    for i, doc in enumerate(col.find({})):
        payload = {
            "name":              doc.get("name", ""),
            "email":             doc.get("email", ""),
            "whatsapp":          doc.get("whatsapp", ""),
            "analysis_id":       doc.get("analysis_id", ""),
            "analysis_filename": doc.get("analysis_filename", ""),
            "overall_score":     doc.get("overall_score"),
            "created_at":        doc.get("created_at", "").isoformat() if hasattr(doc.get("created_at", ""), "isoformat") else str(doc.get("created_at", "")),
            "status":            doc.get("status", "pending"),
        }

        points.append(PointStruct(
            id=i,
            vector=[0.0, 0.0, 0.0, 0.0],
            payload=payload,
        ))

    qdrant.upsert(collection_name="bookings", points=points)
    console.print(f"  ✅ Migrated: {len(points)} bookings")


# ================================================================
# MAIN
# ================================================================

def main():
    parser = argparse.ArgumentParser(description="Migrate MongoDB → Qdrant")
    parser.add_argument("--dry-run", action="store_true", help="Count docs only, don't migrate")
    parser.add_argument("--collection", type=str, help="Migrate a specific collection only")
    args = parser.parse_args()

    if not MONGODB_URI:
        console.print("[red]MONGODB_URI not set in .env[/red]")
        return

    console.rule("MongoDB → Qdrant Migration")
    console.print(f"  MongoDB: {MONGODB_DB}")
    console.print(f"  Qdrant:  {QDRANT_URL}")

    db, mongo_client = get_mongo()
    qdrant = get_qdrant()

    # Verify connections
    try:
        db.command("ping")
        console.print("  ✅ MongoDB connected")
    except Exception as e:
        console.print(f"  [red]MongoDB error: {e}[/red]")
        return

    try:
        qdrant.get_collections()
        console.print("  ✅ Qdrant connected")
    except Exception as e:
        console.print(f"  [red]Qdrant error: {e}[/red]")
        return

    start = time.time()

    if args.collection:
        if args.collection == "legal_chunks":
            migrate_legal_chunks(qdrant, db, args.dry_run)
        elif args.collection == "analyses":
            migrate_analyses(qdrant, db, args.dry_run)
        elif args.collection in ("bookings", "consultation_bookings"):
            migrate_bookings(qdrant, db, args.dry_run)
        else:
            console.print(f"[red]Unknown collection: {args.collection}[/red]")
    else:
        migrate_legal_chunks(qdrant, db, args.dry_run)
        migrate_analyses(qdrant, db, args.dry_run)
        migrate_bookings(qdrant, db, args.dry_run)

    elapsed = time.time() - start
    console.rule(f"Migration complete in {elapsed:.1f}s")

    # Show Qdrant collections
    for c in qdrant.get_collections().collections:
        info = qdrant.get_collection(c.name)
        console.print(f"  {c.name}: {info.points_count} points")

    mongo_client.close()


if __name__ == "__main__":
    main()
