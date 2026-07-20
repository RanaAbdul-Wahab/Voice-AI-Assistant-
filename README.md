# Voice AI Assistant

An enterprise-style multimodal AI assistant supporting:

- Text-based chatbot conversations
- Continuous speech-to-speech voice calls
- Internal company-document retrieval using Vertex AI RAG
- Current-information web search
- LangGraph-based agent orchestration
- Gemini LLM tool calling
- Short-term conversational memory
- Langfuse tracing and observability
- Voice interruption without ending the call

---

## Overview

The Voice AI Assistant provides two interaction experiences through one React application.

### Text chat

The user types a message and receives a text-only response.

```text
User text
   ↓
FastAPI
   ↓
LangGraph
   ↓
Gemini Assistant
   ↓
Text response
```

Typed chatbot responses are not spoken.

### Voice call

The user clicks the microphone button to open a full-screen voice-call interface.

```text
Microphone
   ↓
Google Speech-to-Text
   ↓
LangGraph Assistant
   ↓
Gemini response
   ↓
Gemini Text-to-Speech
   ↓
Browser audio playback
   ↓
Listen for the next question
```

Voice-call transcripts and responses are not displayed in the normal chatbot.

---

## Main Features

### LangGraph orchestration

The assistant uses LangGraph as its orchestration framework.

```text
START
  ↓
Assistant
  ├── Final answer ─────────────→ END
  │
  └── Tool call
          ↓
        Tools
          ↓
      Assistant
          ↺
```

The Assistant node uses Gemini to decide whether it should:

- Answer directly
- Search internal company documents
- Search the public web
- Call another available tool

After a tool returns its result, execution returns to the Assistant node so Gemini can prepare the final answer.

---

### Gemini Assistant node

The Assistant node uses the Gemini Developer API through:

```text
GEMINI_API_KEY
```

The Gemini model is responsible for:

- Understanding user questions
- Maintaining conversational context
- Selecting the correct tool
- Reading tool results
- Producing the final answer

The API key remains in the backend environment and is never exposed to the React frontend.

---

### Internal document retrieval

The assistant can answer questions from internal company documents using Vertex AI RAG.

Example document categories include:

- TADA policy
- International travel policy
- Maternity policy
- OPD policy
- Leave and reimbursement policies

Example request:

```text
What food and transportation expenses are covered under the TADA policy?
```

Expected graph flow:

```text
Assistant
   ↓
search_company_documents
   ↓
Vertex AI RAG
   ↓
Relevant policy passages
   ↓
Assistant
   ↓
Final grounded answer
```

---

### Public web search

The assistant can use a web-search tool for recent or changing public information.

Examples:

```text
What are the latest Vertex AI updates?

Who currently holds a particular public position?

What recent changes were made to a software framework?
```

Web search is separate from company-document RAG.

---

### Continuous voice conversations

The voice-call interface supports:

- Full-screen call experience
- Automatic microphone recording
- Silence detection
- Speech transcription
- Agent response generation
- Text-to-speech generation
- Automatic audio playback
- Automatic return to listening mode
- Call timer
- End-call control

The voice conversation remains active until the user closes or ends the call.

---

### Voice interruption

While the assistant is speaking, the user can press **Interrupt**.

```text
Assistant is speaking
   ↓
User presses Interrupt
   ↓
Current audio stops
   ↓
Voice call remains open
   ↓
Microphone starts listening again
   ↓
User asks another question
```

Interrupting the assistant does not:

- Close the voice-call screen
- End the conversation session
- Stop the microphone permanently
- Delete the previous conversational context

---

### Conversational memory

LangGraph currently uses:

```python
InMemorySaver
```

Each conversation is associated with a LangGraph:

```text
thread_id
```

The frontend sends the backend session ID, which is used as the LangGraph thread ID.

This allows contextual follow-up questions during the same session.

Example:

```text
User: What does the TADA policy say about meals?

Assistant: The policy states...

User: What about transportation?

Assistant: Transportation under the same policy...
```

#### Current memory limitation

The current memory is stored in backend RAM.

It survives:

- Multiple requests using the same session ID
- Follow-up questions
- Continued voice-call turns

It does not survive:

- Backend restarts
- Uvicorn reloads
- Switching to a new session ID

A persistent PostgreSQL or SQLite checkpointer can be integrated later.

---

### Langfuse observability

Langfuse is integrated through the LangChain callback handler.

It traces:

- LangGraph executions
- Gemini generations
- Tool selections
- RAG tool calls
- Web-search calls
- Inputs and outputs
- Execution latency
- Token usage when available
- Errors and failed operations

A typical trace may look like:

```text
Voice AI Assistant
└── LangGraph turn
    ├── Assistant node
    │   └── Gemini generation
    ├── Tools node
    │   └── search_company_documents
    └── Assistant node
        └── Final Gemini response
```

Langfuse is used for monitoring and debugging. It is not the main chat-history database.

---

## Technology Stack

### Backend

- Python 3.12
- FastAPI
- Uvicorn
- LangGraph
- LangChain
- LangChain Google Generative AI
- Gemini Developer API
- Google Gen AI SDK
- Vertex AI
- Vertex AI RAG
- Google Cloud Speech-to-Text V2
- Chirp 3
- Gemini Text-to-Speech
- Langfuse

### Frontend

- React
- Vite
- JavaScript
- MediaRecorder API
- Web Audio API
- CSS

### Development and source control

- Git
- GitHub
- Python virtual environments
- Environment-variable configuration

---

## Project Structure

```text
AI voice assitant/
│
├── Backend/
│   ├── app/
│   │   ├── graph/
│   │   │   ├── __init__.py
│   │   │   └── assistant_graph.py
│   │   │
│   │   ├── tools/
│   │   │   ├── __init__.py
│   │   │   ├── rag_tool.py
│   │   │   └── search_tool.py
│   │   │
│   │   ├── routers/
│   │   │   ├── chat.py
│   │   │   └── speech.py
│   │   │
│   │   ├── services/
│   │   │   ├── speech_to_text.py
│   │   │   └── text_to_speech.py
│   │   │
│   │   ├── observability/
│   │   │   ├── __init__.py
│   │   │   └── langfuse_tracing.py
│   │   │
│   │   ├── agent_runtime.py
│   │   ├── config.py
│   │   ├── main.py
│   │   └── schemas.py
│   │
│   ├── .env
│   ├── .env.example
│   ├── requirements.txt
│   └── test_langfuse.py
│
├── Frontend/
│   ├── src/
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── .env
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
└── README.md
```

---

## Backend API Endpoints

### Health check

```http
GET /health
```

Example response:

```json
{
  "status": "ok",
  "orchestrator": "langgraph",
  "model": "gemini-2.5-flash"
}
```

---

### Chat endpoint

```http
POST /api/chat
Content-Type: application/json
```

Example request:

```json
{
  "question": "What does the TADA policy say about food expenses?",
  "user_id": "abdul-wahab",
  "session_id": null
}
```

Example response:

```json
{
  "answer": "According to the retrieved company policy...",
  "agent": "langgraph_assistant",
  "session_id": "generated-thread-id"
}
```

Reuse the returned `session_id` for follow-up questions.

---

### Speech-to-text endpoint

```http
POST /api/stt
Content-Type: multipart/form-data
```

Form fields:

```text
audio
language_code
```

Example language code:

```text
en-IN
```

Example response:

```json
{
  "transcript": "What is the company travel policy?",
  "language_code": "en-IN"
}
```

---

### Text-to-speech endpoint

```http
POST /api/tts
Content-Type: application/json
```

Example request:

```json
{
  "text": "Here is the answer to your question.",
  "language_code": "en-IN"
}
```

The endpoint returns audio data, which is played through the Web Audio API.

---

## Environment Configuration

Create:

```text
Backend/.env
```

Example:

```env
# Gemini Assistant node
GEMINI_API_KEY=your-gemini-api-key
MODEL_ID=gemini-2.5-flash

# Google Cloud
GOOGLE_CLOUD_PROJECT=your-google-cloud-project
GOOGLE_CLOUD_LOCATION=europe-west3

# Vertex AI RAG
RAG_CORPUS_NAME=projects/PROJECT_NUMBER/locations/europe-west3/ragCorpora/CORPUS_ID
RAG_TOP_K=5
RAG_DISTANCE_THRESHOLD=0.6

# Web search
SEARCH_MODEL_ID=gemini-2.5-flash
SEARCH_LOCATION=global

# Speech-to-Text
STT_LOCATION=eu
STT_MODEL=chirp_3
STT_LANGUAGE_CODE=en-IN

# Text-to-Speech
TTS_LOCATION=global
TTS_MODEL=gemini-2.5-flash-tts
TTS_VOICE_NAME=Kore
TTS_LANGUAGE_CODE=en-IN
TTS_MAX_RESPONSE_BYTES=1800

# Langfuse
LANGFUSE_PUBLIC_KEY=your-langfuse-public-key
LANGFUSE_SECRET_KEY=your-langfuse-secret-key
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=development
LANGFUSE_DEBUG=False

# Frontend
FRONTEND_ORIGIN=http://localhost:5173
```

For a Langfuse EU-region project, use:

```env
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Do not commit the real `.env` file.

---

## Frontend Environment

Create:

```text
Frontend/.env
```

Add:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Restart Vite after changing frontend environment variables.

---

## Installation

### 1. Open the backend directory

```cmd
cd /d "C:\Users\abdul.wahab\Desktop\AI voice assitant\Backend"
```

### 2. Create the virtual environment

```cmd
py -m venv .venv
```

### 3. Activate the environment

```cmd
.venv\Scripts\activate
```

### 4. Install dependencies

```cmd
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 5. Authenticate Google Cloud

```cmd
gcloud auth application-default login
```

Set the project:

```cmd
gcloud config set project your-google-cloud-project
```

---

## Running the Backend

From the Backend folder:

```cmd
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend address:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

---

## Running the Frontend

Open a second CMD window:

```cmd
cd /d "C:\Users\abdul.wahab\Desktop\AI voice assitant\Frontend"
```

Install packages:

```cmd
npm install
```

Start Vite:

```cmd
npm run dev
```

Frontend address:

```text
http://localhost:5173
```

---

## Application Behaviour

### Typed interaction

```text
Typed message
   ↓
POST /api/chat
   ↓
LangGraph
   ↓
Text response displayed
```

The frontend does not call `/api/tts` for typed chatbot messages.

### Voice interaction

```text
Voice recording
   ↓
POST /api/stt
   ↓
POST /api/chat
   ↓
POST /api/tts
   ↓
Audio playback
   ↓
Automatic listening resumes
```

### Voice interruption

```text
AI audio is playing
   ↓
User clicks Interrupt
   ↓
AudioBufferSource stops
   ↓
The call remains active
   ↓
Listening resumes
```

---

## Chat History and Storage

The application currently stores conversational information in multiple places.

### React state

Visible chatbot messages are stored temporarily in React state.

They disappear when the frontend is refreshed or closed.

### Browser local storage

The browser saves the text-chat session ID:

```text
text_chat_session_id
```

The complete visible message history is not currently saved in browser storage.

### LangGraph memory

LangGraph stores the graph state using `InMemorySaver`.

This includes:

- Human messages
- Gemini responses
- Tool calls
- Tool outputs
- Final assistant messages

The data is stored in backend RAM and is lost when the backend restarts.

### Langfuse

Langfuse may store traced inputs, outputs, tool activity, timing information, and model-generation details.

It is intended for observability rather than permanent application chat history.

---

## Testing RAG Retrieval

Test direct retrieval separately from the complete LangGraph flow.

Example questions:

```text
What food expenses are allowed under the TADA policy?

How much can an employee claim for meals during official travel?

What does the maternity policy say about maternity leave?

What is the current price of Bitcoin?
```

Expected behaviour:

| Question type | Expected result |
|---|---|
| TADA question | TADA policy passages |
| Paraphrased TADA question | Similar relevant passages |
| Maternity question | Maternity policy passages |
| Unrelated current question | No misleading internal policy passage |

Check:

- Correct source document
- Correct passage
- Presence of the requested information
- Successful paraphrase retrieval
- Rejection of unrelated queries

---

## Testing Langfuse

Run:

```cmd
.venv\Scripts\python.exe test_langfuse.py
```

Expected:

```text
Langfuse authentication successful.
```

A `401 Unauthorized` error usually means:

- The public and secret keys do not match
- The keys belong to another Langfuse project
- The Langfuse region is incorrect
- The environment-variable names are wrong

---

## Security

Never commit:

- `.env` files
- Gemini API keys
- Langfuse secret keys
- Google Cloud credentials
- Access tokens
- Service-account JSON files
- Database passwords
- Virtual environments
- `node_modules`
- Temporary audio recordings

Recommended `.gitignore` entries:

```gitignore
.env
.env.*
!.env.example

Backend/.env
Frontend/.env

.venv/
venv/
env/
Backend/.venv/

__pycache__/
*.py[cod]

node_modules/
Frontend/node_modules/

dist/
Frontend/dist/

*.wav
*.webm
*.mp3

service-account*.json
credentials*.json
```

Before every commit, review staged files:

```cmd
git diff --cached --name-only
```

---

## Current Limitations

- Voice communication is turn-based rather than fully bidirectional streaming.
- Silence detection is handled in the browser.
- LangGraph checkpoints are stored in memory.
- Visible chat messages are not restored after frontend refresh.
- User authentication is not currently implemented.
- The frontend currently uses a fixed development user ID.
- Voice transcripts are intentionally hidden from the normal chat.
- Long-term cross-session user memory is not yet implemented.

---

## Planned Improvements

- PostgreSQL LangGraph checkpointer
- Persistent conversation history
- User authentication
- Dynamic authenticated user IDs
- Conversation list and chat-history restoration
- Long-term user memory
- Streaming speech-to-text
- Streaming text-to-speech
- Automatic spoken barge-in detection
- Advanced voice activity detection
- MCP tool integrations
- Calendar and Drive integrations
- HR and leave-management tools
- Prompt and RAG evaluations
- Production deployment
- Sensitive-data redaction before tracing

---

## Development Summary

This project demonstrates:

- Multi-agent and tool-based AI architecture
- LangGraph conditional routing
- Gemini tool calling
- Enterprise RAG implementation
- Speech-to-speech AI interaction
- Frontend voice-call state management
- Voice interruption and call continuity
- Short-term conversational memory
- LLM observability using Langfuse
- Secure backend API-key management
- Modular FastAPI and React development

---

## Author

**Rana Abdul Wahab**
