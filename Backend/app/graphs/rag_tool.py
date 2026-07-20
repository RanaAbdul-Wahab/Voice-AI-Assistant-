import asyncio

import vertexai
from langchain_core.tools import tool
from vertexai import rag

from app.config import settings


vertexai.init(
    project=settings.google_cloud_project,
    location=settings.google_cloud_location,
)


def retrieve_company_documents(
    query: str,
) -> str:
    """
    Run Vertex AI RAG retrieval synchronously.

    This function runs inside asyncio.to_thread because the Vertex AI
    RAG client is synchronous.
    """

    corpus_name = (
        settings.rag_corpus_name.strip()
    )

    if not corpus_name:
        raise RuntimeError(
            "RAG_CORPUS_NAME is missing from Backend/.env."
        )

    response = rag.retrieval_query(
        rag_resources=[
            rag.RagResource(
                rag_corpus=corpus_name,
            )
        ],
        text=query,
        rag_retrieval_config=(
            rag.RagRetrievalConfig(
                top_k=settings.rag_top_k,
                filter=rag.utils.resources.Filter(
                    vector_distance_threshold=(
                        settings
                        .rag_distance_threshold
                    ),
                ),
            )
        ),
    )

    contexts_container = getattr(
        response,
        "contexts",
        None,
    )

    contexts = getattr(
        contexts_container,
        "contexts",
        [],
    )

    if not contexts:
        return (
            "No relevant passages were found in the uploaded "
            "company documents."
        )

    formatted_passages: list[str] = []

    for index, context in enumerate(
        contexts,
        start=1,
    ):
        text = str(
            getattr(
                context,
                "text",
                "",
            )
        ).strip()

        source_display_name = str(
            getattr(
                context,
                "source_display_name",
                "",
            )
        ).strip()

        source_uri = str(
            getattr(
                context,
                "source_uri",
                "",
            )
        ).strip()

        source = (
            source_display_name
            or source_uri
            or "Company document"
        )

        if not text:
            continue

        formatted_passages.append(
            f"[Passage {index}]\n"
            f"Source: {source}\n"
            f"{text}"
        )

    if not formatted_passages:
        return (
            "The retrieval service returned results, but the "
            "passages did not contain readable text."
        )

    return "\n\n".join(
        formatted_passages
    )


@tool
async def search_company_documents(
    query: str,
) -> str:
    """
    Search uploaded internal company documents.

    Use this tool for company policies, TADA, travel, maternity,
    OPD, leave, reimbursement, allowance, benefits, and other
    internal organizational information.
    """

    clean_query = query.strip()

    if not clean_query:
        return (
            "A non-empty company-document search query is required."
        )

    try:
        return await asyncio.to_thread(
            retrieve_company_documents,
            clean_query,
        )

    except Exception as exc:
        return (
            "Company-document retrieval failed. "
            f"Error: {exc}"
        )