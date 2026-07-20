from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from app.config import settings
from app.graphs.rag_tool import search_company_documents
from app.graphs.search_tool import search_web

tools = [search_company_documents, search_web]


SYSTEM_PROMPT = """
You are a reliable enterprise AI assistant.

You can answer ordinary conversational and general-knowledge questions
directly.

You have access to these tools:

1. search_company_documents
   Use this tool for questions about internal company documents,
   policies, TADA, travel, maternity, OPD, leave, reimbursements,
   allowances, benefits, and other uploaded organizational documents.

2. search_web
   Use this tool for recent, current, public, changing, or
   time-sensitive information.

Rules:

- Use a tool only when it is relevant.
- Do not invent information from company policies.
- Do not invent recent public information.
- After receiving a tool result, answer the user's original question.
- If the available information is insufficient, clearly say so.
- Give clear, useful, and natural answers.
- Keep answers appropriate for both text chat and spoken voice responses.
- Do not mention LangGraph, graph nodes, routing logic, or tool calls
  unless the user asks about the system architecture.
""".strip()


model = ChatGoogleGenerativeAI(
    model=settings.model_id,
    project=settings.google_cloud_project,
    location=settings.google_cloud_location,
    vertexai=True,
    temperature=0.2,
    max_retries=3,
)


model_with_tools = model.bind_tools(
    tools
)


async def assistant_node(
    state: MessagesState,
) -> dict:
    """
    The assistant either:

    1. Produces a final response, or
    2. Requests one or more tools.

    When a tool is used, the tool result comes back to this node.
    """

    response = await model_with_tools.ainvoke(
        [
            SystemMessage(
                content=SYSTEM_PROMPT
            ),
            *state["messages"],
        ]
    )

    return {
        "messages": [response]
    }


graph_builder = StateGraph(
    MessagesState
)


graph_builder.add_node(
    "assistant",
    assistant_node,
)


graph_builder.add_node(
    "tools",
    ToolNode(tools),
)


graph_builder.add_edge(
    START,
    "assistant",
)


graph_builder.add_conditional_edges(
    "assistant",
    tools_condition,
)


graph_builder.add_edge(
    "tools",
    "assistant",
)


# Development memory:
#
# Messages are remembered when the frontend sends the same session_id.
# The memory is cleared if the backend server restarts.
checkpointer = InMemorySaver()


assistant_graph = graph_builder.compile(
    checkpointer=checkpointer
)