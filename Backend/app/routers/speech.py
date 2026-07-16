import logging
import os

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from ..services.speech_to_text import (
    SpeechToTextService,
)
from ..services.text_to_speech import (
    TextToSpeechService,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api",
    tags=["Speech"],
)


MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024

SUPPORTED_LANGUAGES = {
    "en-IN",
    "en-US",
    "ur-PK",
}

DEFAULT_STT_LANGUAGE = os.getenv(
    "STT_DEFAULT_LANGUAGE",
    "en-IN",
)

DEFAULT_TTS_LANGUAGE = os.getenv(
    "TTS_DEFAULT_LANGUAGE",
    "en-IN",
)


stt_service = SpeechToTextService()
tts_service = TextToSpeechService()


class TextToSpeechRequest(BaseModel):
    text: str = Field(
        min_length=1,
    )

    language_code: str = Field(
        default=DEFAULT_TTS_LANGUAGE,
    )

    voice_name: str | None = None
    prompt: str | None = None


@router.post("/stt")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language_code: str = Form(
        default=DEFAULT_STT_LANGUAGE,
    ),
) -> dict[str, str]:
    """
    Convert uploaded microphone audio into text.
    """

    if language_code not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported language: {language_code}. "
                f"Supported values: "
                f"{sorted(SUPPORTED_LANGUAGES)}"
            ),
        )

    if (
        audio.content_type
        and not audio.content_type.startswith(
            "audio/"
        )
    ):
        raise HTTPException(
            status_code=415,
            detail="The uploaded file must be audio.",
        )

    audio_content = await audio.read()

    await audio.close()

    if not audio_content:
        raise HTTPException(
            status_code=400,
            detail="The audio recording is empty.",
        )

    if (
        len(audio_content)
        > MAX_AUDIO_SIZE_BYTES
    ):
        raise HTTPException(
            status_code=413,
            detail=(
                "The recording is too large. "
                "Keep it below 10 MB."
            ),
        )

    try:
        transcript = await run_in_threadpool(
            stt_service.transcribe,
            audio_content,
            language_code,
        )

        return {
            "transcript": transcript,
            "language_code": language_code,
            "model": stt_service.model,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except Exception as error:
        logger.exception(
            "Speech-to-Text request failed"
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Speech-to-Text failed. "
                "Check the Speech API, billing, "
                "permissions, and microphone recording."
            ),
        ) from error


@router.post("/tts")
async def synthesize_speech(
    request: TextToSpeechRequest,
) -> Response:
    """
    Convert assistant text into MP3 audio.
    """

    if (
        request.language_code
        not in SUPPORTED_LANGUAGES
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Unsupported speech language: "
                f"{request.language_code}"
            ),
        )

    try:
        audio_content = await run_in_threadpool(
            tts_service.synthesize,
            request.text,
            request.language_code,
            request.voice_name,
            request.prompt,
        )

        return Response(
            content=audio_content,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": (
                    'inline; filename="assistant.mp3"'
                ),
                "Content-Length": str(
                    len(audio_content)
                ),
            },
        )
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except Exception as error:
        logger.exception(
            "Text-to-Speech request failed"
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Text-to-Speech failed. "
                "Check the Text-to-Speech API, "
                "billing and permissions."
            ),
        ) from error