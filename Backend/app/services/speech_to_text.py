import os

from google.api_core.client_options import ClientOptions
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech


class SpeechToTextService:
    """
    Google Cloud Speech-to-Text V2 service using Chirp 3.
    """

    def __init__(self) -> None:
        self.project_id = os.getenv(
            "GOOGLE_CLOUD_PROJECT",
            "demoproject-502507",
        )

        self.location = os.getenv(
            "STT_LOCATION",
            "eu",
        )

        self.model = os.getenv(
            "STT_MODEL",
            "chirp_3",
        )

        if self.location == "global":
            api_endpoint = "speech.googleapis.com"
        else:
            api_endpoint = (
                f"{self.location}-speech.googleapis.com"
            )

        self.client = SpeechClient(
            client_options=ClientOptions(
                api_endpoint=api_endpoint,
            )
        )

    def transcribe(
        self,
        audio_content: bytes,
        language_code: str,
    ) -> str:
        """
        Transcribe a short audio recording.

        The audio container/encoding is automatically detected.
        """

        if not audio_content:
            raise ValueError(
                "The uploaded audio file is empty."
            )

        config = cloud_speech.RecognitionConfig(
            auto_decoding_config=(
                cloud_speech.AutoDetectDecodingConfig()
            ),
            language_codes=[
                language_code,
            ],
            model=self.model,
            features=cloud_speech.RecognitionFeatures(
                enable_automatic_punctuation=True,
            ),
        )

        request = cloud_speech.RecognizeRequest(
            recognizer=(
                f"projects/{self.project_id}"
                f"/locations/{self.location}"
                "/recognizers/_"
            ),
            config=config,
            content=audio_content,
        )

        response = self.client.recognize(
            request=request,
        )

        transcript_parts: list[str] = []

        for result in response.results:
            if not result.alternatives:
                continue

            transcript = (
                result.alternatives[0]
                .transcript
                .strip()
            )

            if transcript:
                transcript_parts.append(
                    transcript
                )

        transcript = " ".join(
            transcript_parts
        ).strip()

        if not transcript:
            raise ValueError(
                "No speech could be recognized. "
                "Speak closer to the microphone and try again."
            )

        return transcript