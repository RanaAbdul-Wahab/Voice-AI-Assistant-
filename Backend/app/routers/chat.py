from fastapi import (
    APIRouter,
    HTTPException,
)

from app.agent_runtime import (
    agent_runtime,
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
) -> ChatResponse:
    try:
        reply = await agent_runtime.ask(
            question=request.question,
            user_id=request.user_id,
            session_id=request.session_id,
        )

        return ChatResponse(
            answer=reply.answer,
            agent="langgraph_assistant",
            session_id=reply.session_id,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "The LangGraph assistant could not process "
                f"the request. Error: {exc}"
            ),
        ) from exc