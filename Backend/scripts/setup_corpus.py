from pathlib import Path
import os
import sys

import agentplatform
from agentplatform import types
from dotenv import load_dotenv
from google.genai import types as genai_types


# ---------------------------------------------------------
# Find backend/.env
# ---------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env"

load_dotenv(ENV_FILE)


# ---------------------------------------------------------
# Read values from .env
# ---------------------------------------------------------

PROJECT_ID = "863680939306"
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "europe-west3").strip()
DISPLAY_NAME = os.getenv("CORPUS_DISPLAY_NAME", "test_corpus").strip()
GCS_PATH = os.getenv("GCS_PATH", "").strip()
EXISTING_CORPUS = os.getenv("RAG_CORPUS", "").strip()


def validate_settings() -> None:
    """Check required configuration before calling Google Cloud."""

    if not ENV_FILE.exists():
        raise FileNotFoundError(
            f".env file was not found at: {ENV_FILE}"
        )

    if not PROJECT_ID:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT is missing from backend/.env"
        )

    if not LOCATION:
        raise RuntimeError(
            "GOOGLE_CLOUD_LOCATION is missing from backend/.env"
        )

    if not GCS_PATH:
        raise RuntimeError(
            "GCS_PATH is missing from backend/.env"
        )

    if not GCS_PATH.startswith("gs://"):
        raise RuntimeError(
            "GCS_PATH must start with gs://"
        )

    if EXISTING_CORPUS:
        raise RuntimeError(
            "RAG_CORPUS already contains a value in .env. "
            "Do not create another corpus."
        )


def create_client() -> agentplatform.Client:
    """Create the Google Agent Platform client."""

    print("\nConnecting to Google Cloud...")
    print(f"Project ID: {PROJECT_ID}")
    print(f"Location: {LOCATION}")

    return agentplatform.Client(
        project=PROJECT_ID,
        location=LOCATION,
    )


def create_corpus(client: agentplatform.Client):
    """Create a managed RAG corpus."""

    print("\nCreating RAG corpus...")
    print(f"Display name: {DISPLAY_NAME}")

    embedding_model_config = types.RagEmbeddingModelConfig(
        vertex_prediction_endpoint=(
            types.RagEmbeddingModelConfigVertexPredictionEndpoint(
                endpoint=(
                    "publishers/google/models/"
                    "text-embedding-005"
                )
            )
        )
    )

    corpus = client.rag.create_corpus(
        rag_corpus=types.RagCorpus(
            display_name=DISPLAY_NAME,
            rag_vector_db_config=types.RagVectorDbConfig(
                rag_embedding_model_config=(
                    embedding_model_config
                )
            ),
        )
    )

    print("\nCorpus created successfully.")
    print(f"Corpus name: {corpus.name}")

    return corpus


def import_pdf(
    client: agentplatform.Client,
    corpus_name: str,
):
    """Import and chunk the PDF stored in Google Cloud Storage."""

    print("\nImporting PDF...")
    print(f"File: {GCS_PATH}")
    print("Chunk size: 512")
    print("Chunk overlap: 100")

    result = client.rag.import_files(
        name=corpus_name,
        import_config=types.ImportRagFilesConfig(
            gcs_source=genai_types.GcsSource(
                uris=[GCS_PATH]
            ),
            rag_file_transformation_config=(
                types.RagFileTransformationConfig(
                    rag_file_chunking_config=(
                        types.RagFileChunkingConfig(
                            chunk_size=512,
                            chunk_overlap=100,
                        )
                    )
                )
            ),
            max_embedding_requests_per_min=1000,
        ),
    )

    print("\nPDF import finished.")
    print(result)


def main() -> None:
    validate_settings()

    client = create_client()

    corpus = create_corpus(client)

    import_pdf(
        client=client,
        corpus_name=corpus.name,
    )

    print("\n" + "=" * 70)
    print("RAG SETUP COMPLETED")
    print("=" * 70)

    print("\nCopy this complete line into backend/.env:\n")
    print(f"RAG_CORPUS={corpus.name}")

    print(
        "\nDo not run setup_corpus.py again after saving "
        "the corpus name."
    )


if __name__ == "__main__":
    try:
        main()

    except KeyboardInterrupt:
        print("\nSetup cancelled by user.")
        sys.exit(1)

    except Exception as error:
        print("\nRAG setup failed.")
        print(f"Error type: {type(error).__name__}")
        print(f"Error message: {error}")

        print("\nCheck these items:")
        print("1. Correct Google account is authenticated.")
        print("2. Application Default Credentials are configured.")
        print("3. Vertex AI API is enabled.")
        print("4. The GCS PDF path is correct.")
        print("5. Your account has Vertex AI permissions.")

        sys.exit(1)