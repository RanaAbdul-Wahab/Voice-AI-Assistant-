import logging
import os

from google.api_core.client_options import ClientOptions
from google.cloud import texttospeech


logger = logging.getLogger(__name__)


class TextToSpeechService:
    """
    Google Cloud Gemini Text-to-Speech service.
    """

    def __init__(self) -> None:
        self.location = os.getenv(
            "TTS_LOCATION",
            "global",
        ).strip()

        self.model = os.getenv(
            "TTS_MODEL",
            "gemini-2.5-flash-tts",
        ).strip()

        self.default_voice = os.getenv(
            "TTS_VOICE",
            "Kore",
        ).strip()

        if self.location.lower() == "global":
            api_endpoint = (
                "texttospeech.googleapis.com"
            )
        else:
            api_endpoint = (
                f"{self.location}"
                "-texttospeech.googleapis.com"
            )

        logger.info(
            "Initializing TTS: "
            "location=%s endpoint=%s model=%s voice=%s",
            self.location,
            api_endpoint,
            self.model,
            self.default_voice,
        )

        self.client = (
            texttospeech.TextToSpeechClient(
                client_options=ClientOptions(
                    api_endpoint=api_endpoint,
                )
            )
        )

    def synthesize(
        self,
        text: str,
        language_code: str,
        voice_name: str | None = None,
        prompt: str | None = None,
    ) -> bytes:
        """
        Convert text into WAV audio.

        The prompt is only included when explicitly supplied
        by the API request.
        """

        clean_text = text.strip()

        if not clean_text:
            raise ValueError(
                "Text cannot be empty."
            )

        if len(clean_text.encode("utf-8")) > 4000:
            raise ValueError(
                "Text is too long for one TTS request."
            )

        selected_voice = (
            voice_name.strip()
            if voice_name
            else self.default_voice
        )

        selected_prompt = (
            prompt.strip()
            if prompt and prompt.strip()
            else None
        )

        # Do not inject a default prompt automatically.
        if selected_prompt:
            synthesis_input = (
                texttospeech.SynthesisInput(
                    text=clean_text,
                    prompt=selected_prompt,
                )
            )
        else:
            synthesis_input = (
                texttospeech.SynthesisInput(
                    text=clean_text,
                )
            )

        voice = (
            texttospeech.VoiceSelectionParams(
                language_code=language_code,
                name=selected_voice,
                model_name=self.model,
            )
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=(
                texttospeech.AudioEncoding.MP3
            ),
            # sample_rate_hertz=24000,
        )

        logger.info(
            "Sending TTS request: "
            "location=%s model=%s voice=%s "
            "language=%s prompt=%s",
            self.location,
            self.model,
            selected_voice,
            language_code,
            bool(selected_prompt),
        )

        response = self.client.synthesize_speech(
            input=synthesis_input,
            voice=voice,
            audio_config=audio_config,
        )

        audio_content = response.audio_content

        if not audio_content:
            raise RuntimeError(
                "Google TTS returned empty audio."
            )

        logger.info(
            "TTS generated %s bytes.",
            len(audio_content),
        )

        return audio_content