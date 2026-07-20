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
                "Voice AI Assistant"
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
            result = (
                await self.graph.ainvoke(
                    {
                        "messages": [
                            HumanMessage(
                                content=(
                                    clean_question
                                )
                            )
                        ]
                    },
                    config=config,
                )
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