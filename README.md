# Voice AI Assistant

A production-style multi-agent AI assistant built with **Google ADK**, **Vertex AI**, **FastAPI**, and **React**.

The application supports two interaction styles from one chatbot interface:

- **Text chat:** the user types a message and receives a text response.
- **Voice call:** the user starts a full-screen speech-to-speech call. The system listens, detects silence, transcribes speech, generates an agent response, speaks the answer, and then listens again.

---

## Features

### Text chatbot

- Standard chatbot conversation UI
- Text input with Enter-to-send
- Text-only assistant responses
- Conversation sessions
- New-conversation option
- Responsive desktop and mobile layout

### Speech-to-speech voice call

- Full-screen voice-call interface
- Automatic microphone recording
- Silence detection
- Google Cloud Speech-to-Text V2 with Chirp 3
- Multi-agent response generation
- Gemini text-to-speech
- Automatic audio playback
- Continuous turn-based conversation
- End-call and close controls
- Voice-call content is kept separate from text-chat messages

### Multi-agent system

- **Master Agent:** routes requests to the correct specialist
- **RAG Agent:** answers questions from internal company documents
- **Search Agent:** handles current public-information requests
- Shared Google ADK runner and session service

---

## Architecture

```text
                         ┌─────────────────────┐
                         │    React Frontend   │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
             Text message                    Voice call
                    │                               │
                    │                        Browser microphone
                    │                               │
                    │                         POST /api/stt
                    │                               │
                    │                     Chirp 3 transcription
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                              POST /api/chat
                                    │
                         FastAPI + Google ADK
                                    │
                              Master Agent
                           ┌────────┴────────┐
                           │                 │
                       RAG Agent        Search Agent
                           │                 │
                     Vertex AI RAG      Web search
                           └────────┬────────┘
                                    │
                              Text response
                           ┌────────┴────────┐
                           │                 │
                    Text-chat display   POST /api/tts
                                             │
                                      Gemini TTS audio
                                             │
                                      Browser playback
```

---

## Technology Stack

### Backend

- Python 3.12
- FastAPI
- Uvicorn
- Google Agent Development Kit
- Vertex AI
- Gemini 2.5 Flash
- Vertex AI RAG
- Google Cloud Speech-to-Text V2
- Chirp 3
- Gemini 2.5 Flash TTS

### Frontend

- React
- Vite
- JavaScript
- MediaRecorder API
- Web Audio API
- CSS

---

## Project Structure

```text
Demo_project/
│
├── Backend/
│   ├── app/
│   │   ├── agents/
│   │   │   ├── master_agent.py
│   │   │   ├── rag_agent.py
│   │   │   └── search_agent.py
│   │   │
│   │   ├── routers/
│   │   │   └── speech.py
│   │   │
│   │   ├── services/
│   │   │   ├── speech_to_text.py
│   │   │   └── text_to_speech.py
│   │   │
│   │   ├── agent_runtime.py
│   │   ├── config.py
│   │   ├── main.py
│   │   └── schemas.py
│   │
│   ├── .env
│   └── requirements.txt
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

## Prerequisites

Install the following before running the project:

- Python 3.12
- Node.js and npm
- Git
- Google Cloud CLI
- A Google Cloud project with billing enabled

The following Google Cloud services must be available in the project:

- Vertex AI API
- Speech-to-Text API
- Text-to-Speech API
- Vertex AI RAG resources

---

## Google Cloud Authentication

Authenticate Application Default Credentials:

```cmd
gcloud auth application-default login
```

Set the active project:

```cmd
gcloud config set project demoproject-502507
```

Confirm authentication:

```cmd
gcloud auth application-default print-access-token
```

Do not commit Google credentials, access tokens, service-account keys, or `.env` files.

---

## Backend Environment Variables

Create:

```text
Backend\.env
```

Example:

```env
GOOGLE_CLOUD_PROJECT=demoproject-502507
GOOGLE_CLOUD_LOCATION=europe-west3
GOOGLE_GENAI_USE_VERTEXAI=TRUE

MODEL_ID=gemini-2.5-flash
ADK_APP_NAME=voice_ai_assistant

RAG_CORPUS_NAME=projects/YOUR_PROJECT_NUMBER/locations/europe-west3/ragCorpora/YOUR_CORPUS_ID
RAG_TOP_K=5
RAG_DISTANCE_THRESHOLD=0.6

STT_LOCATION=eu
STT_MODEL=chirp_3
STT_LANGUAGE_CODE=en-IN

TTS_LOCATION=global
TTS_MODEL=gemini-2.5-flash-tts
TTS_VOICE_NAME=Kore
TTS_LANGUAGE_CODE=en-IN
TTS_MAX_RESPONSE_BYTES=1800

FRONTEND_ORIGIN=http://localhost:5173
```

Replace the RAG corpus placeholder with your actual corpus resource name.

---

## Frontend Environment Variables

Create:

```text
Frontend\.env
```

Add:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Restart Vite after changing frontend environment variables.

---

## Backend Setup

Open **Command Prompt** and go to the project root:

```cmd
cd /d "C:\Users\abdul.wahab\Desktop\Demo_project"
```

Create a virtual environment when one does not already exist:

```cmd
python -m venv .venv
```

Activate it:

```cmd
.venv\Scripts\activate
```

Install backend dependencies:

```cmd
pip install -r Backend\requirements.txt
```

Start the FastAPI server:

```cmd
cd Backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend URL:

```text
http://127.0.0.1:8000
```

Interactive API documentation:

```text
http://127.0.0.1:8000/docs
```

---

## Frontend Setup

Open a second Command Prompt window:

```cmd
cd /d "C:\Users\abdul.wahab\Desktop\Demo_project\Frontend"
```

Install dependencies:

```cmd
npm install
```

Start Vite:

```cmd
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

---

## API Endpoints

### Health check

```http
GET /health
```

Checks whether the backend is running.

### Agent chat

```http
POST /api/chat
Content-Type: application/json
```

Example body:

```json
{
  "question": "What is the maternity policy?",
  "user_id": "user-123",
  "session_id": null
}
```

Example response:

```json
{
  "answer": "The policy states...",
  "agent": "master_agent",
  "session_id": "generated-session-id"
}
```

### Speech-to-text

```http
POST /api/stt
Content-Type: multipart/form-data
```

Form fields:

```text
audio          microphone recording
language_code  en-IN
```

Example response:

```json
{
  "transcript": "What is the leave policy?",
  "language_code": "en-IN"
}
```

### Text-to-speech

```http
POST /api/tts
Content-Type: application/json
```

Example body:

```json
{
  "text": "Here is the answer.",
  "language_code": "en-IN"
}
```

Returns an audio response that the frontend plays through the Web Audio API.

---

## Application Behaviour

### Typed message flow

```text
User types a message
        ↓
POST /api/chat
        ↓
Assistant text is displayed
```

Typed messages do not call `/api/tts`.

### Voice-call flow

```text
User starts voice call
        ↓
Browser listens
        ↓
Silence is detected
        ↓
POST /api/stt
        ↓
POST /api/chat
        ↓
POST /api/tts
        ↓
Assistant audio plays
        ↓
Browser listens again
```

Voice-call messages are not added to the normal chatbot history.

---

## Sessions

The backend currently uses Google ADK's:

```python
InMemorySessionService
```

This preserves conversational context while the backend process remains active.

Current limitations:

- Sessions are lost after a backend restart.
- The current frontend demo uses a fixed user ID.
- Voice calls and text chat can use separate session IDs.

For production, replace the fixed user ID with an authenticated user ID and use a persistent session service.

---

## Testing

### Test text chat

Send:

```text
Hello
```

Expected backend request:

```text
POST /api/chat 200 OK
```

There should be no TTS request for typed messages.

### Test voice call

1. Click the microphone button.
2. Allow microphone access.
3. Speak naturally.
4. Pause after finishing your sentence.
5. Wait for the assistant to respond.
6. Continue speaking after the assistant finishes.
7. Press **End call** to return to the chatbot.

Expected backend sequence:

```text
POST /api/stt  200 OK
POST /api/chat 200 OK
POST /api/tts  200 OK
```

---

## Common Errors

### `422 Unprocessable Entity` on `/api/stt`

The frontend multipart field names must match the FastAPI route:

```javascript
formData.append("audio", audioBlob, filename);
formData.append("language_code", languageCode);
```

Do not manually set the multipart `Content-Type` header.

### Import error for `transcribe_audio`

The STT service exposes a class:

```python
SpeechToTextService
```

and a method:

```python
transcribe(audio_content, language_code)
```

The speech router must instantiate the class rather than import a nonexistent function.

### Import error for `TextToSpeechRequest`

Confirm that `Backend/app/schemas.py` includes:

```python
class TextToSpeechRequest(BaseModel):
    text: str
    language_code: str = "en-IN"
```

### Git push rejected with `fetch first`

Run:

```cmd
git fetch origin
git rebase origin/main
git push -u origin main
```

Resolve any conflicts before continuing the rebase.

### Git is not recognized

Locate Git:

```cmd
where git
```

A common installation path is:

```text
C:\Users\abdul.wahab\AppData\Local\Programs\Git\cmd\git.exe
```

Restart VS Code after installing Git so new terminals receive the updated PATH.

### RAG deprecation warning

The application may display a warning that:

```text
vertexai.preview.rag
```

is deprecated. It is a warning rather than a startup failure. A future version should migrate the RAG integration to the Agent Platform client.

---

## Security

Never commit:

- `.env` files
- API keys
- Access tokens
- Service-account JSON files
- Database passwords
- Google Cloud credentials
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
```

Review staged files before committing:

```cmd
git diff --cached --name-only
```

---

## Current Limitations

- Voice communication is turn-based rather than true bidirectional streaming.
- Speech recognition begins processing after silence is detected.
- Sessions are stored in memory.
- Authentication is not yet integrated.
- The demo uses a fixed user ID.
- Long-term user memory is not yet implemented.
- RAG currently uses a deprecated preview module.

---

## Planned Improvements

- Persistent Google ADK sessions
- Long-term user memory
- User authentication
- Streaming speech-to-text
- Streaming Gemini voice responses
- Voice interruption and barge-in
- MCP tool integrations
- Google Calendar and Drive tools
- HR and leave-management integrations
- Production database storage
- Structured logging and monitoring
- Agent tracing and evaluation
- Migration from `vertexai.preview.rag` to Agent Platform

---

## MCP Expansion

Model Context Protocol can later connect the assistant to external business tools such as:

- Google Calendar
- Google Drive
- Jira
- HR systems
- Leave-management systems
- Internal APIs
- Databases

MCP should be added in the backend agent/tool layer. It does not replace Google ADK, STT, TTS, RAG, or memory.

---

## License

Add the appropriate license for your organization before publishing or distributing the project.

---

## Author

**Rana Abdul Wahab**

Repository:

```text
https://github.com/RanaAbdul-Wahab/Voice-AI-Assistant-.git
```
