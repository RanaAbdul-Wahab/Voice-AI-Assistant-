# Aria — Enterprise AI Assistant

Aria is a full-stack AI assistant with **text chat** and **speech-to-speech voice calls**, built on a **LangGraph** tool-calling agent over **Google Vertex AI (Gemini)**, with a **FastAPI** backend and a **React (Vite)** frontend.

It supports user accounts, persistent per-user conversation history, and an agent that can search internal documents, search the web, tell the time, create calendar events, and send email.

---

### Public web search

### Assistant
- **Text chat** with Markdown-rendered responses (links, lists, code).
- **Speech-to-speech voice calls** — record → transcribe → answer → speak → listen again, with silence detection and barge-in (interrupt).
- **LangGraph agent** (ReAct-style) that decides when to use tools.

### Agent tools
- **`search_company_documents`** — RAG over internal documents (Vertex AI RAG).
- **`search_web`** — grounded Google Search via Gemini.
- **`get_current_datetime`** — current date/time so answers aren't guesses.
- **`create_calendar_event`** — creates events on Google Calendar (with confirmation).
- **`send_email`** — sends email via Gmail (with confirmation).

### Accounts & security
- **Register / login / logout** with **JWT** access tokens.
- **bcrypt** password hashing; server-side password-strength rules.
- **Forgot / reset password** via emailed, single-use, expiring tokens.
- Protected endpoints via a `get_current_user` dependency.

### Conversation history
- Conversations and messages stored per user in **SQLite**.
- Sidebar "Recent" list; reopen and continue past conversations.

### Observability
- **Langfuse** tracing for each agent turn.

---

### Conversational memory

LangGraph currently uses:

```python
InMemorySaver
```

Each conversation is associated with a LangGraph:

```text
                 React + Vite (frontend)
                          │
             JWT in Authorization header
                          │
                  FastAPI (backend)
                          │
        ┌─────────────────┼──────────────────────┐
        │                 │                       │
   Auth + history     LangGraph agent        Speech (STT/TTS)
   (SQLite, JWT)      (Gemini 2.5 Flash)     (Chirp 3 / Gemini TTS)
                          │
        ┌────────────┬────┴────┬─────────────┬──────────────┐
        │            │         │             │              │
   RAG (docs)   Web search  date/time   Calendar API    Gmail API
```

- **Chat model** calls Gemini via the **`global`** endpoint (more capacity); **RAG** stays in its corpus region.
- **Google Calendar / Gmail** use per-user **OAuth** (`token.json`); **Vertex AI** uses Application Default Credentials (or the runtime service account).

---

## Tech stack

**Backend:** Python 3.12, FastAPI, Uvicorn, LangGraph, LangChain, `langchain-google-genai`, Google GenAI / Vertex AI (Gemini 2.5 Flash), Vertex AI RAG, Google Cloud Speech-to-Text V2 (Chirp 3), Gemini TTS, Google Calendar & Gmail APIs, PyJWT, bcrypt, SQLite, Langfuse.

**Frontend:** React, Vite, JavaScript, `react-markdown`, MediaRecorder & Web Audio APIs, CSS.

---

## Project structure

```text
Backend/
├── app/
│   ├── graphs/
│   │   ├── assistant_graph.py     # LangGraph agent (nodes, tools, memory)
│   │   ├── rag_tool.py            # search_company_documents
│   │   ├── search_tool.py         # search_web
│   │   ├── datetime_tool.py       # get_current_datetime
│   │   ├── calendar_tool.py       # create_calendar_event
│   │   └── email_tool.py          # send_email
│   ├── routers/
│   │   ├── chat.py                # /api/chat  (protected)
│   │   ├── speech.py              # /api/stt, /api/tts
│   │   ├── auth.py                # register/login/me/forgot/reset
│   │   └── conversations.py       # conversation history
│   ├── services/
│   │   ├── speech_to_text.py
│   │   ├── text_to_speech.py
│   │   ├── gmail_service.py       # shared Gmail send
│   │   └── google_auth.py         # Calendar/Gmail OAuth
│   ├── observability/langfuse_tracing.py
│   ├── agent_runtime.py           # FastAPI ↔ LangGraph wrapper (+ 429 backoff)
│   ├── config.py                  # env-based settings
│   ├── database.py                # SQLite schema/connection
│   ├── conversation_store.py      # conversation persistence
│   ├── dependencies.py            # get_current_user (JWT gate)
│   ├── security.py                # hashing + JWT + password rules
│   ├── schemas.py                 # Pydantic models
│   └── main.py                    # app + routers + startup
├── scripts/
│   ├── setup_corpus.py
│   └── authorize_google.py        # one-time Google OAuth consent
└── requirements.txt

Frontend/
├── src/
│   ├── components/
│   │   ├── AuthScreen.jsx          # login / sign-up / forgot
│   │   ├── ResetPasswordScreen.jsx
│   │   ├── MessageMarkdown.jsx
│   │   └── CopyButton.jsx
│   ├── services/api.js
│   ├── App.jsx / App.css / index.css / main.jsx
└── package.json
```

---

## Backend API Endpoints

- Python 3.12, Node.js + npm, Git
- Google Cloud CLI, and a Google Cloud project with **billing enabled**
- Enabled APIs: **Vertex AI**, **Speech-to-Text**, **Text-to-Speech**, **Calendar**, **Gmail**
- A Vertex AI **RAG corpus**
- An **OAuth client (Desktop)** for Calendar/Gmail

---

## Backend setup

```bash
cd Backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
```

Authenticate to Google Cloud (for Vertex AI):

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

Create `Backend/.env` (see below), then authorize Calendar/Gmail once:

```bash
python scripts/authorize_google.py   # opens a browser to approve; creates token.json
```

Run the server:

```bash
python -m uvicorn app.main:app --reload
# API:  http://127.0.0.1:8000     Docs: http://127.0.0.1:8000/docs
```

### `Backend/.env` (use your own values — never commit this file)

```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=europe-west3
GOOGLE_GENAI_USE_ENTERPRISE=TRUE

MODEL_ID=gemini-2.5-flash
MODEL_LOCATION=global          # chat model endpoint (global = more capacity)

RAG_CORPUS_NAME=projects/PROJECT_NUMBER/locations/REGION/ragCorpora/CORPUS_ID
RAG_TOP_K=3
RAG_DISTANCE_THRESHOLD=0.5

# Web search
SEARCH_MODEL_ID=gemini-2.5-flash
SEARCH_LOCATION=global

# Speech-to-Text
STT_LOCATION=eu
STT_MODEL=chirp_3
TTS_LOCATION=global
TTS_MODEL=gemini-2.5-flash-tts
TTS_VOICE=Kore

JWT_SECRET_KEY=generate-a-long-random-secret
# JWT_EXPIRE_MINUTES=1440

FRONTEND_ORIGIN=http://127.0.0.1:5173

# Langfuse (optional tracing)
LANGFUSE_PUBLIC_KEY=your-public-key
LANGFUSE_SECRET_KEY=your-secret-key
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

---

## Frontend setup

```bash
cd Frontend
npm install
npm run dev            # http://localhost:5173
```

Create `Frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## API overview

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | – | Create account, returns a token |
| POST | `/api/auth/login` | – | Log in, returns a token |
| GET  | `/api/auth/me` | JWT | Current user |
| POST | `/api/auth/forgot-password` | – | Email a reset link |
| POST | `/api/auth/reset-password` | – | Set a new password with a token |
| POST | `/api/chat` | JWT | Ask the agent (identity from token) |
| GET  | `/api/conversations` | JWT | List my conversations |
| GET  | `/api/conversations/{id}` | JWT | One conversation's messages |
| POST | `/api/stt` | – | Speech → text |
| POST | `/api/tts` | – | Text → speech |
| GET  | `/health` | – | Health check |

---

## Security

Never commit secrets. The following are git-ignored and must stay local (or move to a secret manager in production):

- `Backend/.env`
- `Backend/token.json`, `Backend/credentials.json` (Google OAuth)
- `Backend/app.db` (SQLite database)

---

## Deployment (summary)

- **Backend → Cloud Run** (containerized), using a service account with the *Vertex AI User* role and secrets from **Secret Manager**.
- **Frontend → Firebase Hosting** (or a static bucket), built with the deployed `VITE_API_BASE_URL`.
- **Database →** migrate SQLite to **Cloud SQL** (Cloud Run's filesystem is ephemeral).
- Set `FRONTEND_ORIGIN` (backend) and `VITE_API_BASE_URL` (frontend) to the deployed URLs.

---

## Author

**Rana Abdul Wahab** — https://github.com/RanaAbdul-Wahab/Voice-AI-Assistant-
