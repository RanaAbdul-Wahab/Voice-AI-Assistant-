from google import genai
from google.genai import types as genai_types
from google.adk.agents import Agent

from ..config import get_settings
from google.genai import types


settings = get_settings()
maximum_remote_calls=5

# Gemini client used by our existing VertexRagStore code.
genai_client = genai.Client(
    enterprise=True,
    project=settings.project_id,
    location=settings.location,
)


def search_uploaded_documents(question: str) -> dict[str, str]:
    """
    Search the configured RAG corpus and answer from uploaded documents.

    Args:
        question: Complete question to answer using the uploaded documents.

    Returns:
        A dictionary containing the document-grounded answer.
    """

    clean_question = question.strip()

    if not clean_question:
        return {
            "status": "error",
            "answer": "The question cannot be empty.",
        }

    try:
        rag_retrieval_config = genai_types.RagRetrievalConfig(
            top_k=settings.rag_top_k,
            filter=genai_types.RagRetrievalConfigFilter(
                vector_distance_threshold=(
                    settings.rag_distance_threshold
                )
            ),
        )

        # This is your previous VertexRagStore implementation.
        rag_retrieval_tool = genai_types.Tool(
            retrieval=genai_types.Retrieval(
                vertex_rag_store=genai_types.VertexRagStore(
                    rag_resources=[
                        genai_types.VertexRagStoreRagResource(
                            rag_corpus=settings.rag_corpus,
                        )
                    ],
                    rag_retrieval_config=rag_retrieval_config,
                )
            )
        )

        response = genai_client.models.generate_content(
            model=settings.model_id,
            contents=clean_question,
            config=genai_types.GenerateContentConfig(
                tools=[rag_retrieval_tool],

                system_instruction=(
                    "Answer only from the retrieved uploaded documents. "
                    "Do not invent information. If the documents do not "
                    "contain enough information, clearly say so."
                ),
                temperature=0.1,
                max_output_tokens=1500,
            ),
        )

        if not response.text:
            return {
                "status": "error",
                "answer": "The RAG search returned an empty response.",
            }

        return {
            "status": "success",
            "answer": response.text.strip(),
        }

    except Exception as error:
        return {
            "status": "error",
            "answer": (
                "The RAG Agent could not retrieve an answer "
                "from the uploaded documents."
            ),
            "error": str(error),
        }


# Agent 1
rag_agent = Agent(
    name="rag_agent",
    model=settings.model_id,
    description=(
        "A specialist agent that answers questions using "
        "the uploaded private documents."
    ),
    instruction="""
You are the RAG Agent.

Always call the search_uploaded_documents tool before answering.

Use only the information returned by the tool.

Do not use general knowledge to add unsupported facts.

If the tool cannot find sufficient information, clearly tell the user
that the uploaded documents do not contain enough information.
""",
    tools=[
        search_uploaded_documents,
    ],
)