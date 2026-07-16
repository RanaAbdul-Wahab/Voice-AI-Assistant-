# Voice AI Assistant

A full-stack, multi-agent voice assistant built with **Google Agent Development Kit (ADK)**, **Vertex AI RAG**, **Google Search**, **Cloud Speech-to-Text**, **Gemini Text-to-Speech**, **FastAPI**, and **React**.

The assistant can:

- Accept typed questions or microphone recordings
- Convert speech to text using **Chirp 3**
- Route questions through a **Master Agent**
- Search uploaded company documents through a **RAG Agent**
- Search current public information through a **Search Agent**
- Combine document and web information in one answer
- Convert the final answer into speech using **Gemini TTS**
- Prepare and cache audio in the browser for faster replay

---

## Architecture

```text
User
  |
  |-- Typed question
  |-- Microphone recording
  |
  v
React Frontend
  |
  |-- POST /api/stt
  |-- POST /api/chat
  |-- POST /api/tts
  |
  v
FastAPI Backend
  |
  v
Master Agent
  |
  |-- RAG Agent
  |     |
  |     v
  |   Vertex AI RAG Corpus
  |
  |-- Search Agent
        |
        v
      Google Search
```

The Master Agent decides whether the question needs:

- Company documents only
- Current web information only
- Both documents and web search
- A direct general response

---

## Main Features

### Multi-Agent Routing

The Master Agent routes requests to the correct specialized agent.

### Retrieval-Augmented Generation

The RAG Agent searches uploaded company documents stored in a Vertex AI RAG corpus.

Example documents:

- Annual leave policy
- Sick leave policy
- Maternity leave policy
- Travel policy
- OPD policy
- Work-from-home policy
- Reimbursement policy
- Other internal company policies

### Web Search

The Search Agent retrieves current public information for questions that require recent or external data.

### Speech-to-Text

The frontend records microphone audio and sends it to:

```text
POST /api/stt
```

Default configuration:

```text
Model: chirp_3
Language: en-IN
```

### Text-to-Speech

The final answer is converted into audio through:

```text
POST /api/tts
```

Default configuration:

```text
Model: gemini-2.5-flash-tts
Voice: Kore
Language: en-IN
```

The frontend can prepare TTS audio in the background and cache it for repeated playback.

---

## Technology Stack

### Backend

- Python
- FastAPI
- Uvicorn
- Google Agent Development Kit
- Google Gen AI SDK
- Vertex AI
- Vertex AI RAG
- Google Cloud Speech-to-Text
- Google Cloud Text-to-Speech
- Python Multipart
- Python Dotenv

### Frontend

- React
- Vite
- JavaScript
- MediaRecorder API
- Fetch API
- HTML Audio API
- CSS

### Cloud Services

- Google Cloud Vertex AI
- Vertex AI RAG
- Google Search grounding
- Cloud Speech-to-Text
- Cloud Text-to-Speech
- Application Default Credentials

---

## Project Structure

```text
Demo_project/
|
|-- Backend/
|   |
|   |-- app/
|   |   |
|   |   |-- agents/
|   |   |   |-- __init__.py
|   |   |   |-- master_agent.py
|   |   |   |-- rag_agent.py
|   |   |   `-- search_agent.py
|   |   |
|   |   |-- routers/
|   |   |   |-- __init__.py
|   |   |   `-- speech.py
|   |   |
|   |   |-- services/
|   |   |   |-- __init__.py
|   |   |   |-- speech_to_text.py
|   |   |   `-- text_to_speech.py
|   |   |
|   |   |-- __init__.py
|   |   |-- agent_runtime.py
|   |   |-- config.py
|   |   |-- main.py
|   |   |-- rag_service.py
|   |   `-- schemas.py
|   |
|   |-- scripts/
|   |   `-- setup_corpus.py
|   |
|   |-- requirements.txt
|   `-- .env
|
|-- Frontend/
|   |
|   |-- public/
|   |
|   |-- src/
|   |   |
|   |   |-- services/
|   |   |   `-- api.js
|   |   |
|   |   |-- App.css
|   |   |-- App.jsx
|   |   |-- index.css
|   |   `-- main.jsx
|   |
|   |-- package.json
|   |-- package-lock.json
|   |-- vite.config.js
|   `-- .env
|
|-- .gitignore
`-- README.md
```

---

## Prerequisites

Install:

- Python 3.10 or later
- Node.js 20 or later
- npm
- Git
- Google Cloud CLI
- A Google Cloud project with billing enabled

Check installed versions:

```powershell
python --version
node --version
npm --version
git --version
gcloud --version
```

---

## Google Cloud Setup

### 1. Sign in

```powershell
gcloud auth login
```

### 2. Set the project

```powershell
gcloud config set project YOUR_PROJECT_ID
```

### 3. Configure Application Default Credentials

```powershell
gcloud auth application-default login
```

```powershell
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### 4. Enable required APIs

```powershell
gcloud services enable aiplatform.googleapis.com
gcloud services enable speech.googleapis.com
gcloud services enable texttospeech.googleapis.com
```

### 5. Add required IAM permissions

The authenticated user or service account needs the required Vertex AI permissions.

Example:

```powershell
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID `
  --member="user:YOUR_EMAIL" `
  --role="roles/aiplatform.user"
```

---

## Backend Setup

From the project root:

```powershell
cd Backend
```

### 1. Create a virtual environment

```powershell
python -m venv .venv
```

### 2. Activate it

```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then activate again:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

---

## Backend Environment Variables

Create:

```text
Backend/.env
```

Example:

```env
# Google Cloud
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
GOOGLE_CLOUD_LOCATION=europe-west3
GOOGLE_GENAI_USE_VERTEXAI=true

# Agent model
MODEL_ID=gemini-2.5-flash

# Vertex AI RAG
RAG_CORPUS_NAME=projects/YOUR_PROJECT_NUMBER/locations/YOUR_LOCATION/ragCorpora/YOUR_CORPUS_ID
RAG_TOP_K=5

# Speech-to-Text
STT_LOCATION=eu
STT_MODEL=chirp_3
STT_DEFAULT_LANGUAGE=en-IN

# Text-to-Speech
TTS_LOCATION=global
TTS_MODEL=gemini-2.5-flash-tts
TTS_VOICE=Kore
TTS_DEFAULT_LANGUAGE=en-IN

# Voice response size
TTS_MAX_RESPONSE_BYTES=1800

# Optional
# TTS_PROMPT=Speak clearly in a warm professional tone.
```

Do not commit `.env` to GitHub.

---

## Run the Backend

From the `Backend` directory:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Swagger documentation:

```text
http://127.0.0.1:8000/docs
```

---

## Frontend Setup

Open a second terminal:

```powershell
cd Frontend
```

### 1. Install dependencies

```powershell
npm install
```

### 2. Create `Frontend/.env`

```env
VITE_API_URL=http://127.0.0.1:8000
```

### 3. Start the frontend

```powershell
npm run dev
```

Open the URL shown by Vite, normally:

```text
http://localhost:5173
```

---

## API Endpoints

### Health Check

```http
GET /health
```

Example response:

```json
{
  "status": "ok"
}
```

### Chat With the Master Agent

```http
POST /api/chat
```

Example request:

```json
{
  "question": "Compare our maternity leave policy with current law in Pakistan.",
  "user_id": "demo-user",
  "session_id": null
}
```

Example response:

```json
{
  "answer": "The company policy provides...",
  "agent": "master_agent",
  "session_id": "generated-session-id"
}
```

### Speech-to-Text

```http
POST /api/stt
```

Form data:

```text
audio: voice-recording.webm
language_code: en-IN
```

### Text-to-Speech

```http
POST /api/tts
```

Example request:

```json
{
  "text": "Your leave request has been approved.",
  "language_code": "en-IN",
  "voice_name": "Kore",
  "prompt": null
}
```

The endpoint returns audio data.

---

## Test Questions

### RAG Agent

```text
How many annual leaves are allowed according to our company policy?
```

### Search Agent

```text
What are the latest developments in generative AI?
```

### Combined RAG and Web Search

```text
Compare our company maternity leave policy with the latest maternity leave laws applicable in Pakistan. Highlight differences in duration, pay, eligibility, and employee rights.
```

Another combined test:

```text
According to our uploaded leave policy, how many annual leaves are available, and how does this compare with current labour-law requirements in Pakistan?
```

---

## Voice Flow

```text
Microphone recording
        |
        v
POST /api/stt
        |
        v
Transcript appears in the input field
        |
        v
POST /api/chat
        |
        v
Master Agent selects RAG, Search, or both
        |
        v
Text response appears
        |
        v
POST /api/tts runs in the background
        |
        v
Audio is cached in the browser
        |
        v
Speak button plays the prepared audio
```

---

## Response-Length Control

Long responses take more time to synthesize and produce larger audio files. The project therefore uses:

1. Agent instructions that request concise spoken responses
2. A backend byte limit before the text is sent to TTS

Example:

```env
TTS_MAX_RESPONSE_BYTES=1800
```

A useful target is approximately 60 to 90 spoken words.

---

## Automatic Function-Calling Limit

The agents can be configured with a maximum number of automatic remote calls:

```python
from google.genai import types

generate_content_config=types.GenerateContentConfig(
    automatic_function_calling=types.AutomaticFunctionCallingConfig(
        maximum_remote_calls=5
    )
)
```

This limit applies to each model invocation, not necessarily to the complete multi-agent request.

---

## Security

Never commit:

```text
.env
.venv/
node_modules/
service-account.json
credentials.json
*.wav
*.mp3
__pycache__/
*.pyc
```

Recommended `.gitignore`:

```gitignore
# Environment variables
.env
.env.*
!.env.example
Backend/.env
Frontend/.env

# Python
.venv/
venv/
Backend/.venv/
Backend/venv/
__pycache__/
*.py[cod]

# Frontend
node_modules/
Frontend/node_modules/
Frontend/dist/
Frontend/.vite/

# Generated audio
*.wav
*.mp3
*.ogg
*.webm

# Credentials
*credentials*.json
service-account*.json

# Editor and OS files
.vscode/
.DS_Store
Thumbs.db
```

---

## Common Issues

### Git is not recognized

Restart VS Code after installing Git, then run:

```powershell
git --version
```

### Google credentials are not found

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### `/api/tts` returns 405

The endpoint supports `POST`, not `GET`.

### TTS is slower than the Master Agent

Synchronous TTS generates the complete audio before returning it. Current optimizations include:

- Shorter agent responses
- Background TTS generation
- Browser audio caching
- Optional compressed audio output

A future improvement is streaming TTS over WebSockets.

### Microphone permission denied

Allow microphone access in the browser:

```text
Site settings -> Microphone -> Allow
```

### CORS error

Confirm that FastAPI allows the frontend origin:

```text
http://localhost:5173
```

---

## Future Improvements

- Streaming agent responses
- Streaming TTS through WebSockets
- User authentication
- Conversation history database
- Role-based access to company documents
- Document upload interface
- Source citations in RAG answers
- Admin dashboard
- Observability and tracing
- Automated tests
- Docker deployment
- Cloud Run deployment
- GitHub Actions CI/CD

---

## Git Workflow

After making changes:

```powershell
git status
git add .
git commit -m "Describe the changes"
git push
```

Example:

```powershell
git add .
git commit -m "Improve voice playback and frontend interface"
git push
```

---

## Repository

```text
https://github.com/RanaAbdul-Wahab/Voice-AI-Assistant-.git
```

---

## Author

**Rana Abdul Wahab**

---

## License

This project is currently intended for learning, demonstration, and internal development. Add a formal license before distributing or using it commercially.
