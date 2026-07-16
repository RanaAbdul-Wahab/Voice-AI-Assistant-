from google import genai
from google.genai import types as genai_types

from .config import Settings


class RagService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

        if not self.settings.rag_corpus:
            raise RuntimeError(
                "RAG_CORPUS is missing from backend/.env. "
                "Run scripts/setup_corpus.py and add the corpus name."
            )

        self.genai_client = genai.Client(
            enterprise=True,
            project=self.settings.project_id,
            location=self.settings.location,
        )

    def ask_question(
        self,
        question: str,
        top_k: int = 3,
        vector_distance_threshold: float = 0.5,
    ) -> str:
        """
        Retrieve relevant PDF chunks and ask Gemini to generate an answer.
        """

        rag_retrieval_config = genai_types.RagRetrievalConfig(
            top_k=top_k,
            filter=genai_types.RagRetrievalConfigFilter(
                vector_distance_threshold=vector_distance_threshold
            ),
        )

        rag_retrieval_tool = genai_types.Tool(
            retrieval=genai_types.Retrieval(
                vertex_rag_store=genai_types.VertexRagStore(
                    rag_resources=[
                        genai_types.VertexRagStoreRagResource(
                            rag_corpus=self.settings.rag_corpus,
                        )
                    ],
                    rag_retrieval_config=rag_retrieval_config,
                )
            )
        )

        response = self.genai_client.models.generate_content(
            model=self.settings.model_id,
            contents=question,
            config=genai_types.GenerateContentConfig(
                tools=[rag_retrieval_tool],
                system_instruction=(
                    "You are a helpful document assistant. "
                    "Answer using the retrieved document context. "
                    "If the answer is not available in the document, "
                    "clearly say that the document does not contain "
                    "enough information. Do not invent information."
                ),
            ),
        )

        if not response.text:
            raise RuntimeError(
                "Gemini returned an empty response."
            )

        return response.text