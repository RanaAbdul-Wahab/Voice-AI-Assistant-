import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


def get_required_environment(
    name: str,
) -> str:
    value = os.getenv(
        name,
        "",
    ).strip()

    if not value:
        raise RuntimeError(
            f"{name} is missing from Backend/.env."
        )

    return value


def get_integer_environment(
    name: str,
    default: int,
) -> int:
    raw_value = os.getenv(
        name,
        str(default),
    ).strip()

    try:
        return int(
            raw_value
        )

    except ValueError as exc:
        raise RuntimeError(
            f"{name} must be an integer."
        ) from exc


def get_float_environment(
    name: str,
    default: float,
) -> float:
    raw_value = os.getenv(
        name,
        str(default),
    ).strip()

    try:
        return float(
            raw_value
        )

    except ValueError as exc:
        raise RuntimeError(
            f"{name} must be a number."
        ) from exc


@dataclass(frozen=True)
class Settings:
    google_cloud_project: str
    google_cloud_location: str

    model_id: str
    search_model_id: str
    search_location: str

    rag_corpus_name: str
    rag_top_k: int
    rag_distance_threshold: float

    frontend_origin: str

    @classmethod
    def from_environment(
        cls,
    ) -> "Settings":
        return cls(
            google_cloud_project=(
                get_required_environment(
                    "GOOGLE_CLOUD_PROJECT"
                )
            ),

            google_cloud_location=(
                os.getenv(
                    "GOOGLE_CLOUD_LOCATION",
                    "europe-west3",
                ).strip()
                or "europe-west3"
            ),

            model_id=(
                os.getenv(
                    "MODEL_ID",
                    "gemini-2.5-flash",
                ).strip()
                or "gemini-2.5-flash"
            ),

            search_model_id=(
                os.getenv(
                    "SEARCH_MODEL_ID",
                    "gemini-2.5-flash",
                ).strip()
                or "gemini-2.5-flash"
            ),

            search_location=(
                os.getenv(
                    "SEARCH_LOCATION",
                    "global",
                ).strip()
                or "global"
            ),

            rag_corpus_name=(
                os.getenv(
                    "RAG_CORPUS_NAME",
                    "",
                ).strip()
            ),

            rag_top_k=(
                get_integer_environment(
                    "RAG_TOP_K",
                    5,
                )
            ),

            rag_distance_threshold=(
                get_float_environment(
                    "RAG_DISTANCE_THRESHOLD",
                    0.6,
                )
            ),

            frontend_origin=(
                os.getenv(
                    "FRONTEND_ORIGIN",
                    "http://localhost:5173",
                ).strip()
                or "http://localhost:5173"
            ),
        )


settings = Settings.from_environment()


def get_settings() -> Settings:
    return settings