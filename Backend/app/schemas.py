from pydantic import (
    BaseModel,
    Field,
)


class ChatRequest(BaseModel):
    question: str = Field(
        min_length=1,
    )

    user_id: str = Field(
        min_length=1,
    )

    session_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    agent: str
    session_id: str


class TextToSpeechRequest(BaseModel):
    text: str = Field(
        min_length=1,
    )

    language_code: str = "en-IN"


class SpeechToTextResponse(BaseModel):
    transcript: str
    language_code: str


class HealthResponse(BaseModel):
    status: str
    orchestrator: str
    model: str