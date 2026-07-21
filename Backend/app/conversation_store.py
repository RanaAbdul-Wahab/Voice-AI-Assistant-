"""
Persistent conversation history (SQLite).

A "conversation" groups messages for one chat thread, owned by a user. We
reuse the LangGraph session_id as the key that ties messages together, so
the same session_id always maps to the same stored conversation.

These functions are synchronous (plain sqlite3); callers run them via
run_in_threadpool so they don't block the async server.
"""

from app.database import get_connection


def _make_title(text: str) -> str:
    """Build a short conversation title from the first user message."""

    clean = " ".join(text.split())

    if not clean:
        return "New conversation"

    return clean[:57] + "…" if len(clean) > 60 else clean


def save_exchange(
    user_id: int,
    session_id: str,
    user_text: str,
    assistant_text: str,
) -> int:
    """
    Append one user+assistant exchange to the conversation for this
    (user, session). Creates the conversation on the first exchange.
    Returns the conversation id.
    """

    connection = get_connection()

    try:
        row = connection.execute(
            "SELECT id FROM conversations "
            "WHERE user_id = ? AND session_id = ?",
            (user_id, session_id),
        ).fetchone()

        if row is None:
            cursor = connection.execute(
                "INSERT INTO conversations "
                "(user_id, session_id, title) VALUES (?, ?, ?)",
                (user_id, session_id, _make_title(user_text)),
            )
            conversation_id = cursor.lastrowid
        else:
            conversation_id = row["id"]

        connection.execute(
            "INSERT INTO messages (conversation_id, role, text) "
            "VALUES (?, ?, ?)",
            (conversation_id, "user", user_text),
        )
        connection.execute(
            "INSERT INTO messages (conversation_id, role, text) "
            "VALUES (?, ?, ?)",
            (conversation_id, "assistant", assistant_text),
        )

        # Bump updated_at so the newest conversation sorts to the top.
        connection.execute(
            "UPDATE conversations SET updated_at = datetime('now') "
            "WHERE id = ?",
            (conversation_id,),
        )

        connection.commit()

        return conversation_id

    finally:
        connection.close()


def list_conversations(user_id: int) -> list[dict]:
    """Return the user's conversations, newest first."""

    connection = get_connection()

    try:
        rows = connection.execute(
            "SELECT id, title, updated_at FROM conversations "
            "WHERE user_id = ? "
            "ORDER BY datetime(updated_at) DESC, id DESC",
            (user_id,),
        ).fetchall()

        return [dict(row) for row in rows]

    finally:
        connection.close()


def get_conversation_messages(
    user_id: int,
    conversation_id: int,
) -> dict | None:
    """
    Return a conversation's session_id + messages (oldest first) — but only
    if it belongs to this user. Returns None if not found / not owned.

    The session_id lets the frontend continue the conversation (it becomes
    the thread_id again on the next message).
    """

    connection = get_connection()

    try:
        owner = connection.execute(
            "SELECT session_id FROM conversations "
            "WHERE id = ? AND user_id = ?",
            (conversation_id, user_id),
        ).fetchone()

        if owner is None:
            return None

        rows = connection.execute(
            "SELECT role, text, created_at FROM messages "
            "WHERE conversation_id = ? ORDER BY id ASC",
            (conversation_id,),
        ).fetchall()

        return {
            "session_id": owner["session_id"],
            "messages": [dict(row) for row in rows],
        }

    finally:
        connection.close()
