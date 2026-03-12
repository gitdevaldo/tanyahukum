"""POST /api/chat — Follow-up chat about analysis results."""
import asyncio
import logging
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.config import settings
from api.models.schemas import ChatRequest, ChatResponse
from api.services.llm import get_llm_client
from api.services.guardrails import (
    is_on_topic, build_chat_system_prompt, CHAT_DISCLAIMER_ID, CHAT_LIMIT_RESPONSE
)
from api.services.storage import try_increment_chat, CHAT_LIMIT
from api.dependencies import verify_api_key

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("20/minute")
async def chat(request: Request, chat_request: ChatRequest):
    """Chat follow-up about contract analysis results.

    Includes topic guardrails and per-analysis chat limits.
    """
    # Atomic chat limit check + increment (fixes C-04 race condition)
    if chat_request.analysis_id:
        allowed, current_count = await asyncio.to_thread(
            try_increment_chat, chat_request.analysis_id, CHAT_LIMIT
        )
        if not allowed:
            return ChatResponse(
                message=CHAT_LIMIT_RESPONSE,
                disclaimer=CHAT_DISCLAIMER_ID,
                remaining_chats=0,
            )

    # Topic guardrail
    if not is_on_topic(chat_request.message):
        return ChatResponse(
            message="Maaf, saya hanya bisa membantu terkait analisis kontrak dan hukum Indonesia. "
                    "Apakah ada pertanyaan tentang kontrak atau hasil analisis Anda?",
            disclaimer=CHAT_DISCLAIMER_ID,
        )

    # Build conversation
    analysis_context = chat_request.analysis_context
    if not analysis_context and chat_request.analysis_id:
        analysis_context = f"Analisis ID: {chat_request.analysis_id}"

    system_prompt = build_chat_system_prompt(analysis_context)

    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history — only user/assistant roles (fixes C-05)
    for msg in chat_request.conversation_history[-10:]:
        if msg.role in ("user", "assistant"):
            messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": chat_request.message})

    try:
        client = get_llm_client()
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=settings.do_model,
            messages=messages,
            temperature=0.4,
            max_tokens=1000,
        )

        reply = response.choices[0].message.content.strip()

        remaining = CHAT_LIMIT
        if chat_request.analysis_id:
            remaining = max(0, CHAT_LIMIT - current_count)

        return ChatResponse(
            message=reply,
            disclaimer=CHAT_DISCLAIMER_ID,
            remaining_chats=remaining,
        )

    except Exception as e:
        logger.error(f"Chat failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chat gagal. Silakan coba lagi.")
