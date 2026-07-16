import logging
from uuid import uuid4

from .config import get_settings

settings = get_settings()
from .routers.speech import (
    router as speech_router,
)

from .agents.master_agent import master_agent
from .agents.rag_agent import rag_agent

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .agent_runtime import AgentRuntime
from .agents.master_agent import master_agent
from .agents.rag_agent import rag_agent
from .config import get_settings
from .schemas import (
    AgentDescription,
    ChatRequest,
    ChatResponse,
    HealthResponse,
)


logging.basicConfig(
    level=logging.INFO,
)

logger = logging.getLogger(
    __name__
)


settings = get_settings()


app = FastAPI(
    title="Two-Agent RAG Backend",
    version="1.0.0",
    description=(
        "FastAPI backend containing a Master Assistant Agent "
        "and a specialized RAG Agent."
    ),
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(speech_router)

# Runtime used by the main Master Agent.
master_runtime = AgentRuntime(
    agent=master_agent,
    app_name="master_agent_application",
)


# Separate runtime for directly testing the RAG Agent.
rag_runtime = AgentRuntime(
    agent=rag_agent,
    app_name="rag_agent_application",
)


@app.get("/")
async def root():
    return {
        "message": "Two-Agent RAG backend is working",
        "main_endpoint": "/api/chat",
        "rag_test_endpoint": "/api/rag",
        "documentation": "/docs",
    }


@app.get(
    "/health",
    response_model=HealthResponse,
)
async def health():
    return HealthResponse(
        status="ok",
        project_id=settings.project_id,
        location=settings.location,
        model=settings.model_id,
        rag_corpus_configured=bool(
            settings.rag_corpus
        ),
        available_agents=[
            "master_agent",
            "rag_agent",
        ],
    )


@app.get(
    "/agents",
    response_model=list[AgentDescription],
)
async def list_agents():
    return [
        AgentDescription(
            name="master_agent",
            role=(
                "Primary assistant. It can call the "
                "RAG Agent as a tool."
            ),
            endpoint="/api/chat",
        ),
        AgentDescription(
            name="rag_agent",
            role=(
                "Document specialist. It answers using "
                "the configured RAG corpus."
            ),
            endpoint="/api/rag",
        ),
    ]


@app.post(
    "/api/chat",
    response_model=ChatResponse,
)
async def chat_with_master_agent(
    request: ChatRequest,
):
    """
    Main endpoint.

    The user talks to the Master Agent.
    The Master Agent decides whether it needs the RAG Agent.
    """

    session_id = (
        request.session_id
        or uuid4().hex
    )

    try:
        answer = await master_runtime.ask(
            question=request.question,
            user_id=request.user_id,
            session_id=session_id,
        )

        return ChatResponse(
            answer=answer,
            agent="master_agent",
            session_id=session_id,
        )

    except Exception as error:
        logger.exception(
            "Master Agent request failed"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Master Agent request failed: "
                f"{error}"
            ),
        ) from error


@app.post(
    "/api/rag",
    response_model=ChatResponse,
)
async def chat_directly_with_rag_agent(
    request: ChatRequest,
):
    """
    Testing endpoint.

    This bypasses the Master Agent and talks directly
    to the RAG Agent.
    """

    session_id = (
        request.session_id
        or uuid4().hex
    )

    try:
        answer = await rag_runtime.ask(
            question=request.question,
            user_id=request.user_id,
            session_id=session_id,
        )

        return ChatResponse(
            answer=answer,
            agent="rag_agent",
            session_id=session_id,
        )

    except Exception as error:
        logger.exception(
            "RAG Agent request failed"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "RAG Agent request failed: "
                f"{error}"
            ),
        ) from error