"""
SQLite database access.

We use Python's built-in `sqlite3` module — no extra libraries — so that
every database operation is fully visible: we write the SQL ourselves.

SQLite stores the entire database in a single file on disk, so there is no
separate database server to run. That makes it ideal for local development.
"""

import sqlite3
from pathlib import Path


# The database lives at Backend/app.db.
#
# Path(__file__)              -> this file (Backend/app/database.py)
# .resolve().parent           -> the app/ folder
# .parent                     -> the Backend/ folder
# So the database file sits directly inside Backend/.
DATABASE_PATH = (
    Path(__file__).resolve().parent.parent
    / "app.db"
)


def get_connection() -> sqlite3.Connection:
    """
    Open a new connection to the SQLite database file.

    Setting row_factory = sqlite3.Row makes query results behave like
    dictionaries (row["email"]) instead of plain tuples (row[0]), which
    keeps the rest of our code readable.
    """

    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row

    return connection


def init_db() -> None:
    """
    Create the `users` table if it does not already exist.

    Safe to run on every startup: "CREATE TABLE IF NOT EXISTS" does nothing
    when the table is already present.

    Columns:
      id               a unique auto-incrementing number per user
      email            the login email (UNIQUE = no two users share one)
      hashed_password  the scrambled password — never the real password
      created_at       when the account was created (defaults to "now")
    """

    connection = get_connection()

    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                email           TEXT    NOT NULL UNIQUE,
                hashed_password TEXT    NOT NULL,
                created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
            )
            """
        )

        # Password-reset tokens.
        #   token_hash  we store the HASH of the token, never the raw token
        #   expires_at  ISO timestamp after which the token is dead
        #   used        0 until the token is spent, then 1 (single-use)
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS password_resets (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                token_hash TEXT    NOT NULL,
                expires_at TEXT    NOT NULL,
                used       INTEGER NOT NULL DEFAULT 0,
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )

        # A saved chat conversation, owned by a user.
        #   session_id  the LangGraph thread id (ties messages together)
        #   title       taken from the first user message
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                session_id TEXT    NOT NULL,
                title      TEXT    NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )

        # Individual messages belonging to a conversation.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL,
                role            TEXT    NOT NULL,
                text            TEXT    NOT NULL,
                created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (conversation_id) REFERENCES conversations (id)
            )
            """
        )

        connection.commit()

    finally:
        # Always close the connection, even if the statement above fails.
        connection.close()
