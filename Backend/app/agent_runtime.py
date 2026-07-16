import asyncio
from typing import Any

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


class AgentRuntime:
    def __init__(
        self,
        agent: Any,
        app_name: str,
    ) -> None:
        self.agent = agent
        self.app_name = app_name

        self.session_service = InMemorySessionService()

        self.runner = Runner(
            agent=self.agent,
            app_name=self.app_name,
            session_service=self.session_service,
        )

        self._created_sessions: set[
            tuple[str, str]
        ] = set()

        self._session_lock = asyncio.Lock()

    async def ensure_session(
        self,
        user_id: str,
        session_id: str,
    ) -> None:
        session_key = (
            user_id,
            session_id,
        )

        if session_key in self._created_sessions:
            return

        async with self._session_lock:
            if session_key in self._created_sessions:
                return

            await self.session_service.create_session(
                app_name=self.app_name,
                user_id=user_id,
                session_id=session_id,
            )

            self._created_sessions.add(
                session_key
            )

    async def ask(
        self,
        question: str,
        user_id: str,
        session_id: str,
    ) -> str:
        await self.ensure_session(
            user_id=user_id,
            session_id=session_id,
        )

        user_message = types.Content(
            role="user",
            parts=[
                types.Part(
                    text=question,
                )
            ],
        )

        final_response = ""
        last_text_response = ""

        events = self.runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=user_message,
        )

        async for event in events:
            event_text = self._extract_text(
                event
            )

            if event_text:
                last_text_response = event_text

            if (
                event.is_final_response()
                and event_text
            ):
                final_response = event_text

        if final_response:
            return final_response

        if last_text_response:
            return last_text_response

        raise RuntimeError(
            "The agent completed without returning "
            "a text response."
        )

    @staticmethod
    def _extract_text(
        event: Any,
    ) -> str:
        if not event.content:
            return ""

        if not event.content.parts:
            return ""

        text_parts = []

        for part in event.content.parts:
            text = getattr(
                part,
                "text",
                None,
            )

            if text:
                text_parts.append(
                    text
                )

        return "".join(
            text_parts
        ).strip()