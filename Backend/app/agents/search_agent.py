from google.adk.agents import Agent
from google.adk.tools import google_search

from ..config import get_settings


settings = get_settings()
from google.genai import types


search_agent = Agent(
    name="web_search_agent",

    model=settings.model_id,

    description=(
        "A specialist web-search agent that searches Google for "
        "current, recent, public and externally verifiable information."
    ),

    instruction="""
You are the Web Search Agent.

Your responsibility is to answer questions that require current,
recent or publicly available internet information.

Rules:

1. Use Google Search whenever the user's question depends on:
   - current information,
   - recent events,
   - latest developments,
   - current people or office holders,
   - recent software documentation,
   - current prices, schedules or regulations,
   - facts that need external verification.

2. Base your answer on the Google Search results.

3. Clearly distinguish verified facts from your own interpretation.

4. Include source attribution supplied by Google Search.

5. Do not claim that information came from the user's private
   documents.

6. Do not use this tool for questions about uploaded PDFs or private
   internal documents. Those belong to the RAG Agent.

7. If reliable information cannot be found, say that clearly.

8. Give the Master Agent a complete, concise and well-supported answer.
""",

    # Google Search should remain the Search Agent's only tool.
    tools=[
        google_search,
    ],

    generate_content_config=types.GenerateContentConfig(
        automatic_function_calling=(
            types.AutomaticFunctionCallingConfig(
                maximum_remote_calls=5,
            )
        ),
    ),
)