"""
Conversation-history endpoints (all require a logged-in user).

  GET /api/conversations             -> list my conversations (newest first)
  GET /api/conversations/{id}        -> the messages of one of my conversations
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.conversation_store import (
    get_conversation_messages,
    list_conversations,
)
from app.dependencies import get_current_user
from app.schemas import (
    ConversationDetail,
    ConversationSummary,
    MessageItem,
)


router = APIRouter(
    prefix="/api/conversations",
    tags=["conversations"],
)


@router.get(
    "",
    response_model=list[ConversationSummary],
)
async def get_conversations(
    current_user: dict = Depends(get_current_user),
) -> list[ConversationSummary]:
    rows = await run_in_threadpool(
        list_conversations,
        current_user["id"],
    )

    return [ConversationSummary(**row) for row in rows]


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetail,
)
async def get_conversation(
    conversation_id: int,
    current_user: dict = Depends(get_current_user),
) -> ConversationDetail:
    result = await run_in_threadpool(
        get_conversation_messages,
        current_user["id"],
        conversation_id,
    )

    # None = not found OR not owned by this user (same 404, no leaking).
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    return ConversationDetail(
        id=conversation_id,
        session_id=result["session_id"],
        messages=[
            MessageItem(**m) for m in result["messages"]
        ],
    )
