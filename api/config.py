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

    # Internal API key for Next.js → FastAPI auth
    internal_api_key: str = os.getenv("INTERNAL_API_KEY", "7s9DTtir3BH7TCGDZYGF6UKW--eulLPvEBi6gPMwvUc")

    # Analysis settings
    max_upload_size_mb: int = 20
    rag_top_k: int = 5
    max_clauses: int = 100

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = [
        "https://tanyahukum.dev",
        "http://localhost:3010",
        "http://localhost:3000",
        "http://165.245.145.20:3010",
        "http://165.245.145.20:8000",
    ]

    class Config:
        env_file = str(env_path)
        extra = "ignore"


settings = Settings()
