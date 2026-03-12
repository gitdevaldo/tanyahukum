import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)


class Settings(BaseSettings):
    # MongoDB
    mongodb_uri: str = os.getenv("MONGODB_URI", "")
    mongodb_db: str = os.getenv("MONGODB_DB", "tanyahukum")

    # Mistral (embeddings)
    mistral_api_key: str = os.getenv("MISTRAL_API_KEY", "")
    mistral_embed_model: str = "mistral-embed"
    embed_dimensions: int = 1024

    # DigitalOcean Gradient (LLM)
    do_model_access_key: str = os.getenv("DO_MODEL_ACCESS_KEY", "")
    do_inference_url: str = os.getenv("DO_INFERENCE_URL", "https://inference.do-ai.run/v1")
    do_model: str = os.getenv("DO_MODEL", "anthropic-claude-4.6-sonnet")

    # Resend (transactional email)
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    resend_from_email: str = os.getenv("RESEND_FROM_EMAIL", "TanyaHukum <noreply@app.tanyahukum.dev>")
    admin_email: str = os.getenv("ADMIN_EMAIL", "aldodkris@gmail.com")

    # Internal API key for Next.js → FastAPI auth
    internal_api_key: str = os.getenv("INTERNAL_API_KEY", "7s9DTtir3BH7TCGDZYGF6UKW--eulLPvEBi6gPMwvUc")

    # Analysis settings
    max_upload_size_mb: int = 15  # M-03: stay under MongoDB 16MB BSON limit
    rag_top_k: int = 5
    max_clauses: int = 100

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = [
        "https://tanyahukum.dev",
        "http://localhost:3010",
        "http://localhost:3000",
    ]

    class Config:
        env_file = str(env_path)
        extra = "ignore"


settings = Settings()

# M-09: Validate critical API keys at import time
if not settings.mongodb_uri:
    raise ValueError("MONGODB_URI is required — set it in .env")
if not settings.do_model_access_key:
    raise ValueError("DO_MODEL_ACCESS_KEY is required — set it in .env")
