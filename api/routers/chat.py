"""POST /api/chat — Follow-up chat about analysis results."""
import logging
from openai import OpenAI
from fastapi import APIRouter, HTTPException

from api.config import settings
from api.models.schemas import ChatRequest, ChatResponse
from api.services.guardrails import (
    is_on_topic, build_chat_system_prompt, CHAT_DISCLAIMER_ID, CHAT_LIMIT_RESPONSE
)
from api.services.storage import get_chat_usage, increment_chat_count, CHAT_LIMIT

logger = logging.getLogger(__name__)
router = APIRouter()

_llm_client = None


def get_llm_client() -> OpenAI:
    global _llm_client
    if _llm_client is None:
        _llm_client = OpenAI(
            base_url=settings.do_inference_url,
            api_key=settings.do_model_access_key,
        )
    return _llm_client


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat follow-up about contract analysis results.

    Includes topic guardrails and per-analysis chat limits.
    """
    # Chat limit check
    if request.analysis_id:
        current_count, limit = get_chat_usage(request.analysis_id)
        if current_count >= limit:
            return ChatResponse(
                message=CHAT_LIMIT_RESPONSE,
                disclaimer=CHAT_DISCLAIMER_ID,
                remaining_chats=0,
            )

    # Topic guardrail
    if not is_on_topic(request.message):
        return ChatResponse(
            message="Maaf, saya hanya bisa membantu terkait analisis kontrak dan hukum Indonesia. "
                    "Apakah ada pertanyaan tentang kontrak atau hasil analisis Anda?",
            disclaimer=CHAT_DISCLAIMER_ID,
        )

    # Build conversation
    analysis_context = request.analysis_context
    if not analysis_context and request.analysis_id:
        analysis_context = f"Analisis ID: {request.analysis_id}"

    system_prompt = build_chat_system_prompt(analysis_context)

    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history
    for msg in request.conversation_history[-10:]:  # Keep last 10 messages
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": request.message})

    try:
        client = get_llm_client()
        response = client.chat.completions.create(
            model=settings.do_model,
            messages=messages,
            temperature=0.4,
            max_tokens=1000,
        )

        reply = response.choices[0].message.content.strip()

        # Increment chat count after successful LLM response
        remaining = CHAT_LIMIT
        if request.analysis_id:
            new_count = increment_chat_count(request.analysis_id)
            remaining = max(0, CHAT_LIMIT - new_count)

        return ChatResponse(
            message=reply,
            disclaimer=CHAT_DISCLAIMER_ID,
            remaining_chats=remaining,
        )

    except Exception as e:
        logger.error(f"Chat failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat gagal: {str(e)[:200]}")
