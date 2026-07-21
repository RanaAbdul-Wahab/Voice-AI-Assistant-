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
    model_location: str
    search_model_id: str
    search_location: str

    rag_corpus_name: str
    rag_top_k: int
    rag_distance_threshold: float

    frontend_origin: str

    # JWT / authentication settings
    jwt_secret_key: str
    jwt_algorithm: str
    jwt_expire_minutes: int

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

            # Endpoint region for the chat model. "global" pools capacity
            # across regions and avoids the per-region 429s we hit in
            # europe-west3. (RAG stays in its own region — see rag_tool.)
            model_location=(
                os.getenv(
                    "MODEL_LOCATION",
                    "global",
                ).strip()
                or "global"
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

            # Secret used to SIGN tokens. Anyone who knows it can forge
            # tokens, so keep it out of git and set a real value in
            # Backend/.env (JWT_SECRET_KEY). The default is dev-only.
            jwt_secret_key=(
                os.getenv(
                    "JWT_SECRET_KEY",
                    "dev-only-insecure-secret-change-me",
                ).strip()
                or "dev-only-insecure-secret-change-me"
            ),

            # HS256 = sign with a shared secret (simplest, fine here).
            jwt_algorithm=(
                os.getenv(
                    "JWT_ALGORITHM",
                    "HS256",
                ).strip()
                or "HS256"
            ),

            # How long a login stays valid. 1440 minutes = 24 hours.
            jwt_expire_minutes=(
                get_integer_environment(
                    "JWT_EXPIRE_MINUTES",
                    1440,
                )
            ),
        )


settings = Settings.from_environment()


def get_settings() -> Settings:
    return settings