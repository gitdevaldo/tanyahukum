"""Mistral embedding service for clause vectors."""
import re
import time
import httpx
from api.config import settings

MISTRAL_EMBED_URL = "https://api.mistral.ai/v1/embeddings"
MAX_RETRIES = 3


def sanitize_text(text: str) -> str:
    """Clean text for embedding — strip null bytes, control chars, excess whitespace."""
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts using Mistral mistral-embed.

    Returns list of 1024-dim vectors. Retries up to MAX_RETRIES on transient errors.
    """
    cleaned = [sanitize_text(t)[:8000] for t in texts]

    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = httpx.post(
                MISTRAL_EMBED_URL,
                headers={
                    "Authorization": f"Bearer {settings.mistral_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.mistral_embed_model,
                    "input": cleaned,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in data["data"]]
        except (httpx.TransportError, httpx.HTTPStatusError) as e:
            last_err = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
    raise last_err  # type: ignore[misc]


def embed_single(text: str) -> list[float]:
    """Embed a single text. Returns 1024-dim vector."""
    return embed_texts([text])[0]
