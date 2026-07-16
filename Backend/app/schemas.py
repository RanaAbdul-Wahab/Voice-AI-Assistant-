from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(
        min_length=2,
        max_length=5000,
        description="The user's message or question.",
    )

    user_id: str = Field(
        default="web-user",
        min_length=1,
        max_length=100,
        description="Identifier for the current user.",
    )

    session_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=150,
        description=(
            "Reuse the returned session_id to continue "
            "the same conversation."
        ),
    )


class ChatResponse(BaseModel):
    answer: str
    agent: str
    session_id: str


class HealthResponse(BaseModel):
    status: str
    project_id: str
    location: str
    model: str
    rag_corpus_configured: bool
    available_agents: list[str]


class AgentDescription(BaseModel):
    name: str
    role: str
    endpoint: str