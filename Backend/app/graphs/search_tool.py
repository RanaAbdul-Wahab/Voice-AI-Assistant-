import asyncio
from typing import Any

from google import genai
from google.genai import types
from langchain_core.tools import tool

from app.config import settings


search_client = genai.Client(
    vertexai=True,
    project=settings.google_cloud_project,
    location=settings.search_location,
)


def extract_grounding_sources(
    response: Any,
) -> list[str]:
    """
    Extract source titles and URLs returned by Google Search grounding.
    """

    sources: list[str] = []

    candidates = getattr(
        response,
        "candidates",
        [],
    )

    if not candidates:
        return sources

    grounding_metadata = getattr(
        candidates[0],
        "grounding_metadata",
        None,
    )

    if grounding_metadata is None:
        return sources

    grounding_chunks = getattr(
        grounding_metadata,
        "grounding_chunks",
        [],
    )

    for chunk in grounding_chunks:
        web_source = getattr(
            chunk,
            "web",
            None,
        )

        if web_source is None:
            continue

        title = str(
            getattr(
                web_source,
                "title",
                "",
            )
        ).strip()

        uri = str(
            getattr(
                web_source,
                "uri",
                "",
            )
        ).strip()

        if title and uri:
            source = f"{title}: {uri}"
        else:
            source = title or uri

        if (
            source
            and source not in sources
        ):
            sources.append(source)

    return sources


def perform_web_search(
    query: str,
) -> str:
    """
    Run a grounded Gemini request synchronously.
    """

    response = (
        search_client.models.generate_content(
            model=settings.search_model_id,
            contents=query,
            config=types.GenerateContentConfig(
                temperature=0,
                tools=[
                    types.Tool(
                        google_search=(
                            types.GoogleSearch()
                        )
                    )
                ],
            ),
        )
    )

    answer = str(
        getattr(
            response,
            "text",
            "",
        )
    ).strip()

    sources = extract_grounding_sources(
        response
    )

    if not answer:
        answer = (
            "Google Search did not return a readable answer."
        )

    if sources:
        answer += (
            "\n\nSources returned by Google Search:\n- "
            + "\n- ".join(
                sources[:8]
            )
        )

    return answer


@tool
async def search_web(
    query: str,
) -> str:
    """
    Search the public web for recent or changing information.

    Use this for current events, recent technology updates, public
    schedules, current office holders, recent news, or facts that may
    have changed over time.
    """

    clean_query = query.strip()

    if not clean_query:
        return (
            "A non-empty web-search query is required."
        )

    try:
        return await asyncio.to_thread(
            perform_web_search,
            clean_query,
        )

    except Exception as exc:
        return (
            "Web search failed. "
            f"Error: {exc}"
        )