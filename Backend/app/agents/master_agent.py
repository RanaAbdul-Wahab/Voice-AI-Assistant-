from google.adk.agents import Agent
from google.adk.tools.agent_tool import AgentTool

from ..config import get_settings
from .rag_agent import rag_agent
from .search_agent import search_agent
from google.genai import types


settings = get_settings()
maximum_remote_calls=5


# Agent 1 wrapper: private document specialist
rag_agent_wrapper = AgentTool(
    agent=rag_agent,
    skip_summarization=False,
)


# Agent 2 wrapper: current public web information specialist
search_agent_wrapper = AgentTool(
    agent=search_agent,
    skip_summarization=False,
)


master_agent = Agent(
    name="master_agent",

    model=settings.model_id,

    description=(
        "The main assistant agent. It can answer general questions, "
        "delegate private-document questions to the RAG Agent, and "
        "delegate current public-information questions to the Web "
        "Search Agent."
    ),

    instruction="""
You are the Master Assistant Agent.

You are the main agent that communicates with the user.

1. Keep the final answer concise and suitable for spoken audio.

2. Normal responses must be no longer than approximately
   500 words.

You have access to two specialist agent tools:

1. rag_agent:
   Searches the user's uploaded private documents using the configured
   Vertex RAG corpus.

2. web_search_agent:
   Searches Google for current and publicly available information.

ROUTING RULES

1. Use rag_agent for:
   - uploaded PDFs,
   - private documents,
   - internal policies,
   - internal company files,
   - questions that say "according to my document",
   - information stored in the RAG corpus.

2. Use web_search_agent for:
   - latest or recent information,
   - current news,
   - present-day facts,
   - current prices,
   - current schedules,
   - recent software or API documentation,
   - public information that needs online verification.


4. For ordinary greetings or stable general questions that require
   neither private documents nor current web information, answer
   directly.

5. Never use web_search_agent to search for the user's private files.

6. Never answer document-specific questions from general knowledge.
   Call rag_agent.

7. Never present current or recent information from memory when it
   should be verified. Call web_search_agent.

8. When using both tools:
   - clearly identify what came from the documents,
   - clearly identify what came from web search,
   - do not combine unsupported facts.

9. Preserve uncertainty reported by either specialist agent.

10. Give the user one clear final answer rather than merely repeating
    raw tool output.
""",

    tools=[
        rag_agent_wrapper,
        search_agent_wrapper,
    ],
)