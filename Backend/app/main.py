from fastapi import FastAPI

from fastapi.middleware.cors import (
    CORSMiddleware,
)

from app.config import settings

from app.routers.chat import (
    router as chat_router,
)

from app.routers.speech import (
    router as speech_router,
)

from app.schemas import (
    HealthResponse,
)


app = FastAPI(
    title="Voice AI Assistant",
    version="2.0.0",
    description=(
        "LangGraph-orchestrated text and "
        "speech-to-speech AI assistant."
    ),
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