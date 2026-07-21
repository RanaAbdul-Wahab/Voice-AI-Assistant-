from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from fastapi.concurrency import run_in_threadpool

from app.agent_runtime import (
    AssistantBusyError,
    agent_runtime,
)

from app.conversation_store import save_exchange

from app.dependencies import (
    get_current_user,
)

from app.schemas import (
    ChatRequest,
    ChatResponse,
)


router = APIRouter(
    prefix="/api",
    tags=["chat"],
)


@router.post(
    "/chat",
    response_model=ChatResponse,
)
async def chat(
    request: ChatRequest,
    current_user: dict = Depends(
        get_current_user,
    ),
) -> ChatResponse:
    try:
        # Identity comes from the VERIFIED TOKEN, not the request body,
        # so a client can never claim to be a different user.
        reply = await agent_runtime.ask(
            question=request.question,
            user_id=str(current_user["id"]),
            session_id=request.session_id,
        )

        # Persist the exchange to the user's conversation history.
        # If saving fails, we still return the answer (don't lose it).
        conversation_id = None
        try:
            conversation_id = await run_in_threadpool(
                save_exchange,
                current_user["id"],
                reply.session_id,
                request.question,
                reply.answer,
            )
        except Exception:
            conversation_id = None

        return ChatResponse(
            answer=reply.answer,
            agent="langgraph_assistant",
            session_id=reply.session_id,
            conversation_id=conversation_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except AssistantBusyError as exc:
        # 429 = "Too Many Requests". A clean, friendly message instead of
        # the raw RESOURCE_EXHAUSTED error.
        raise HTTPException(
            status_code=429,
            detail=(
                "Aria is receiving a lot of requests right now. "
                "Please wait a few seconds and try again."
            ),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "The LangGraph assistant could not process "
                f"the request. Error: {exc}"
            ),
        ) from exc