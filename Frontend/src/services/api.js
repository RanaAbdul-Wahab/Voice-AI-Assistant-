const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";


async function readError(response) {
  try {
    const data = await response.json();

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => item.msg)
        .join(", ");
    }

    return (
      data.message ||
      `Request failed with status ${response.status}.`
    );
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}


export async function checkBackendHealth() {
  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/health`
    );
  } catch {
    throw new Error(
      "Cannot connect to the backend."
    );
  }

  if (!response.ok) {
    throw new Error(
      await readError(response)
    );
  }

  return response.json();
}


export async function sendMessage({
  question,
  userId,
  sessionId,
}) {
  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/chat`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          question,
          user_id: userId,
          session_id: sessionId || null,
        }),
      }
    );
  } catch {
    throw new Error(
      "Cannot connect to the backend. " +
        "Confirm FastAPI is running on port 8000."
    );
  }

  if (!response.ok) {
    throw new Error(
      await readError(response)
    );
  }

  return response.json();
}


export async function transcribeAudio({
  audioBlob,
  languageCode,
}) {
  const formData = new FormData();

  let extension = "webm";

  if (audioBlob.type.includes("ogg")) {
    extension = "ogg";
  }

  if (audioBlob.type.includes("wav")) {
    extension = "wav";
  }

  formData.append(
    "audio",
    audioBlob,
    `voice-recording.${extension}`
  );

  formData.append(
    "language_code",
    languageCode
  );

  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/stt`,
      {
        method: "POST",
        body: formData,
      }
    );
  } catch {
    throw new Error(
      "Could not upload the voice recording."
    );
  }

  if (!response.ok) {
    throw new Error(
      await readError(response)
    );
  }

  return response.json();
}


export async function synthesizeSpeech({
  text,
  languageCode,
}) {
  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/tts`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          text,
          language_code: languageCode,
          voice_name: "Kore",
          prompt: null,
        }),
      }
    );
  } catch {
    throw new Error(
      "Could not connect to the Text-to-Speech service."
    );
  }

  if (!response.ok) {
    throw new Error(
      await readError(response)
    );
  }

  return response.blob();
}