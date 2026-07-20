from dotenv import load_dotenv
from langfuse import get_client
from langfuse.langchain import CallbackHandler


# Ensure Backend/.env is loaded before
# Langfuse reads its configuration.
load_dotenv()


# The client automatically reads:
#
# LANGFUSE_PUBLIC_KEY
# LANGFUSE_SECRET_KEY
# LANGFUSE_BASE_URL
# LANGFUSE_TRACING_ENVIRONMENT
langfuse_client = get_client()


def create_langfuse_handler() -> CallbackHandler:
    """
    Create a Langfuse callback handler for one
    LangGraph request.

    A separate handler per request keeps FastAPI
    request tracing isolated and straightforward.
    """

    return CallbackHandler()