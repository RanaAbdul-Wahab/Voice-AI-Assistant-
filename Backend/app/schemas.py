from pydantic import (
    BaseModel,
    Field,
    field_validator,
)

from app.security import validate_password_strength


class ChatRequest(BaseModel):
    question: str = Field(
        min_length=1,
    )

    # No user_id here on purpose: the user is identified by their token
    # (see get_current_user), so we never trust a client-supplied id.
    session_id: str | None = None


class ChatResponse(BaseModel):
    answer: str
    agent: str
    session_id: str
    conversation_id: int | None = None


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


# ----- Authentication -----

class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str

    # The frontend checks this too (for a nice experience), but the
    # frontend can be bypassed, so THIS server-side check is the real guard.
    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str


class UserResponse(BaseModel):
    user_id: int
    email: str


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    password: str

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class MessageResponse(BaseModel):
    message: str


# ----- Conversation history -----

class ConversationSummary(BaseModel):
    id: int
    title: str
    updated_at: str


class MessageItem(BaseModel):
    role: str
    text: str
    created_at: str


class ConversationDetail(BaseModel):
    id: int
    session_id: str
    messages: list[MessageItem]