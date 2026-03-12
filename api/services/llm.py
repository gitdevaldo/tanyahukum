"""Shared LLM client singleton with thread-safe initialization."""
import threading
import httpx
from openai import OpenAI
from api.config import settings

_lock = threading.Lock()
_llm_client: OpenAI | None = None


def get_llm_client() -> OpenAI:
    """Thread-safe lazy initialization of the OpenAI-compatible LLM client."""
    global _llm_client
    if _llm_client is None:
        with _lock:
            if _llm_client is None:
                _llm_client = OpenAI(
                    base_url=settings.do_inference_url,
                    api_key=settings.do_model_access_key,
                    timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0),
                )
    return _llm_client
