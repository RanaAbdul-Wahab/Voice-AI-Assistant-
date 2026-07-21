import asyncio

from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from langchain_core.messages import (
    AIMessage,
    HumanMessage,
)

from langchain_core.runnables import (
    RunnableConfig,
)

from langfuse import propagate_attributes

from app.graphs import assistant_graph

from app.observability import (
    create_langfuse_handler,
)


class AssistantBusyError(Exception):
    """
    Raised when the model is rate-limited (HTTP 429 / RESOURCE_EXHAUSTED)
    even after we retried with backoff. The API layer turns this into a
    friendly 429 response instead of a raw error.
    """


def _is_rate_limit_error(exc: Exception) -> bool:
    """Detect a Vertex AI 429 / quota error from its message text."""

    text = str(exc).lower()

    return (
        "429" in text
        or "resource_exhausted" in text
        or "resource exhausted" in text
    )


@dataclass(frozen=True)
class AgentReply:
    answer: str
    session_id: str


class AgentRuntime:
    """
    FastAPI wrapper around the compiled LangGraph.

    session_id is used as LangGraph's thread_id.

    Reusing the same session_id preserves short-term
    conversation context and groups related traces
    inside Langfuse.
    """

    def __init__(self) -> None:
        self.graph = assistant_graph

    async def ask(
        self,
        question: str,
        user_id: str,
        session_id: str | None = None,
    ) -> AgentReply:
        clean_question = question.strip()
        clean_user_id = user_id.strip()

        if not clean_question:
            raise ValueError(
                "Question cannot be empty."
            )

        if not clean_user_id:
            raise ValueError(
                "User ID cannot be empty."
            )

        if (
            session_id
            and session_id.strip()
        ):
            thread_id = (
                session_id.strip()
            )
        else:
            thread_id = str(
                uuid4()
            )

        langfuse_handler = (
            create_langfuse_handler()
        )

        config: RunnableConfig = {
            "configurable": {
                "thread_id": thread_id,
                "user_id": clean_user_id,
            },
            "callbacks": [
                langfuse_handler,
            ],
            "run_name": (
                "voice-ai-assistant-turn"
            ),
        }

        with propagate_attributes(
            trace_name=(
                "Aria"
            ),
            user_id=clean_user_id,
            session_id=thread_id,
            tags=[
                "langgraph",
                "gemini",
                "voice-ai-assistant",
            ],
            metadata={
                "orchestrator": (
                    "langgraph"
                ),
                "application": (
                    "voice-ai-assistant"
                ),
            },
        ):
            result = await self._invoke_with_retry(
                clean_question,
                config,
            )

        messages = result.get(
            "messages",
            [],
        )

        answer = (
            self.extract_final_answer(
                messages
            )
        )

        if not answer:
            raise RuntimeError(
                "LangGraph completed without returning "
                "a readable assistant response."
            )

        return AgentReply(
            answer=answer,
            session_id=thread_id,
        )

    async def _invoke_with_retry(
        self,
        question: str,
        config: RunnableConfig,
    ) -> dict:
        """
        Run the graph, retrying transient rate-limit (429) errors with
        increasing backoff. If still limited after every attempt, raise
        AssistantBusyError for the API layer to turn into a clean message.
        """

        # Waits BEFORE the 2nd and 3rd attempts (3 attempts total).
        backoffs = [3.0, 6.0]
        attempts = len(backoffs) + 1

        for attempt in range(attempts):
            try:
                return await self.graph.ainvoke(
                    {
                        "messages": [
                            HumanMessage(
                                content=question,
                            )
                        ]
                    },
                    config=config,
                )

            except Exception as exc:
                # A real bug should fail fast — only retry rate limits.
                if not _is_rate_limit_error(exc):
                    raise

                # Out of retries -> surface a clean "busy" signal.
                if attempt == attempts - 1:
                    raise AssistantBusyError(
                        "The AI service is temporarily overloaded.",
                    ) from exc

                # Otherwise wait, then try again.
                await asyncio.sleep(
                    backoffs[attempt],
                )

    @classmethod
    def extract_final_answer(
        cls,
        messages: list[Any],
    ) -> str:
        """
        Return the latest completed AI answer.

        AI messages containing unresolved tool calls
        are skipped.
        """

        for message in reversed(
            messages
        ):
            if not isinstance(
                message,
                AIMessage,
            ):
                continue

            tool_calls = getattr(
                message,
                "tool_calls",
                None,
            )

            if tool_calls:
                continue

            text = cls.content_to_text(
                message.content
            )

            if text:
                return text

        return ""

    @staticmethod
    def content_to_text(
        content: Any,
    ) -> str:
        """
        Convert Gemini/LangChain message content
        into plain text.
        """

        if isinstance(
            content,
            str,
        ):
            return content.strip()

        if not isinstance(
            content,
            list,
        ):
            return str(
                content
            ).strip()

        text_parts: list[str] = []

        for block in content:
            if isinstance(
                block,
                str,
            ):
                clean_block = (
                    block.strip()
                )

                if clean_block:
                    text_parts.append(
                        clean_block
                    )

                continue

            if not isinstance(
                block,
                dict,
            ):
                continue

            text = block.get(
                "text"
            )

            if (
                isinstance(text, str)
                and text.strip()
            ):
                text_parts.append(
                    text.strip()
                )

        return "\n".join(
            text_parts
        ).strip()


agent_runtime = AgentRuntime()