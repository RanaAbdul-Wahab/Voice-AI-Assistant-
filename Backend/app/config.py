from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv


# ---------------------------------------------------------
# Locate and load Backend/.env
# ---------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"

if not ENV_FILE.exists():
    raise RuntimeError(
        f".env file was not found at: {ENV_FILE}"
    )

# override=True ensures the values inside Backend/.env are applied.
load_dotenv(
    dotenv_path=ENV_FILE,
    override=True,
)


# ---------------------------------------------------------
# Force ADK to use Google Cloud / Vertex AI
# ---------------------------------------------------------

enterprise_value = os.getenv(
    "GOOGLE_GENAI_USE_ENTERPRISE",
    "",
).strip().lower()

vertexai_value = os.getenv(
    "GOOGLE_GENAI_USE_VERTEXAI",
    "",
).strip().lower()

truthy_values = {
    "true",
    "1",
    "yes",
}

if (
    enterprise_value not in truthy_values
    and vertexai_value not in truthy_values
):
    raise RuntimeError(
        "Vertex AI mode is not enabled. Add these lines to Backend/.env:\n"
        "GOOGLE_GENAI_USE_ENTERPRISE=TRUE\n"
        "GOOGLE_GENAI_USE_VERTEXAI=TRUE"
    )

# Keep both variables available for old and new ADK versions.
os.environ["GOOGLE_GENAI_USE_ENTERPRISE"] = "TRUE"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "TRUE"


@dataclass(frozen=True)
class Settings:
    project_id: str
    location: str
    model_id: str
    rag_corpus: str
    rag_top_k: int
    rag_distance_threshold: float
    frontend_origin: str


@lru_cache
def get_settings() -> Settings:
    project_id = os.getenv(
        "GOOGLE_CLOUD_PROJECT",
        "",
    ).strip()

    location = os.getenv(
        "GOOGLE_CLOUD_LOCATION",
        "",
    ).strip()

    model_id = os.getenv(
        "MODEL_ID",
        "gemini-2.5-flash",
    ).strip()

    rag_corpus = os.getenv(
        "RAG_CORPUS",
        "",
    ).strip()

    frontend_origin = os.getenv(
        "FRONTEND_ORIGIN",
        "http://127.0.0.1:5173",
    ).strip()

    try:
        rag_top_k = int(
            os.getenv(
                "RAG_TOP_K",
                "3",
            )
        )
    except ValueError as error:
        raise RuntimeError(
            "RAG_TOP_K must be a whole number."
        ) from error

    try:
        rag_distance_threshold = float(
            os.getenv(
                "RAG_DISTANCE_THRESHOLD",
                "0.5",
            )
        )
    except ValueError as error:
        raise RuntimeError(
            "RAG_DISTANCE_THRESHOLD must be a decimal number."
        ) from error

    missing_variables = []

    if not project_id:
        missing_variables.append(
            "GOOGLE_CLOUD_PROJECT"
        )

    if not location:
        missing_variables.append(
            "GOOGLE_CLOUD_LOCATION"
        )

    if not model_id:
        missing_variables.append(
            "MODEL_ID"
        )

    if not rag_corpus:
        missing_variables.append(
            "RAG_CORPUS"
        )

    if missing_variables:
        raise RuntimeError(
            "Missing environment variable(s): "
            + ", ".join(missing_variables)
        )

    placeholders = (
        "YOUR_REAL_CORPUS_NUMBER",
        "YOUR_CORPUS_NUMBER",
        "REPLACE_ME",
    )

    if any(
        placeholder in rag_corpus
        for placeholder in placeholders
    ):
        raise RuntimeError(
            "RAG_CORPUS still contains a placeholder. "
            "Add the real corpus resource name."
        )

    if not rag_corpus.startswith("projects/"):
        raise RuntimeError(
            "RAG_CORPUS must be the complete resource name "
            "starting with 'projects/'."
        )

    if not 1 <= rag_top_k <= 20:
        raise RuntimeError(
            "RAG_TOP_K must be between 1 and 20."
        )

    if not 0.0 <= rag_distance_threshold <= 1.0:
        raise RuntimeError(
            "RAG_DISTANCE_THRESHOLD must be between 0 and 1."
        )

    return Settings(
        project_id=project_id,
        location=location,
        model_id=model_id,
        rag_corpus=rag_corpus,
        rag_top_k=rag_top_k,
        rag_distance_threshold=rag_distance_threshold,
        frontend_origin=frontend_origin,
    )