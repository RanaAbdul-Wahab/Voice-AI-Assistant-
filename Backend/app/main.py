from contextlib import asynccontextmanager

from fastapi import FastAPI

from fastapi.middleware.cors import (
    CORSMiddleware,
)

from app.config import settings

from app.database import init_db

from app.routers.chat import (
    router as chat_router,
)

from app.routers.speech import (
    router as speech_router,
)

from app.routers.auth import (
    router as auth_router,
)

from app.routers.conversations import (
    router as conversations_router,
)

from app.schemas import (
    HealthResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Everything before `yield` runs ONCE, when the server starts.
    # We use it to make sure the SQLite database and its tables exist.
    init_db()

    yield

    # Anything after `yield` would run on shutdown (nothing needed yet).


app = FastAPI(
    title="Aria",
    version="2.0.0",
    description=(
        "Aria — LangGraph-orchestrated text and "
        "speech-to-speech AI assistant."
    ),
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    chat_router
)


# Keep your existing speech router.
#
# STT and TTS remain outside LangGraph.
app.include_router(
    speech_router
)


# Register and login endpoints (/api/auth/...).
app.include_router(
    auth_router
)


# Conversation history (/api/conversations/...).
app.include_router(
    conversations_router
)


@app.get(
    "/health",
    response_model=HealthResponse,
)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        orchestrator="langgraph",
        model=settings.model_id,
    )