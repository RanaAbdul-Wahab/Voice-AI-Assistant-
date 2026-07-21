const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");


/*
 * Where we keep the JWT in the browser. localStorage survives page
 * refreshes, so the user stays logged in until they log out or the
 * token expires.
 */
const TOKEN_KEY = "auth_token";


export function getToken() {
  return (
    localStorage.getItem(TOKEN_KEY) ||
    ""
  );
}


export function setToken(token) {
  if (token) {
    localStorage.setItem(
      TOKEN_KEY,
      token,
    );
  }
}


export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}


/*
 * Build request headers, adding "Authorization: Bearer <token>" only
 * when we actually have a token. `extra` lets callers merge in their
 * own headers (like Content-Type).
 */
function authHeaders(extra = {}) {
  const token = getToken();

  if (!token) {
    return { ...extra };
  }

  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}


async function getErrorMessage(
  response,
  fallbackMessage,
) {
  try {
    const data = await response.json();

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((item) => {
          const location =
            item.loc?.join(".") ||
            "request";

          return `${location}: ${item.msg}`;
        })
        .join(", ");
    }

    return (
      data.message ||
      fallbackMessage
    );
  } catch {
    return fallbackMessage;
  }
}


export async function checkBackendHealth() {
  const response = await fetch(
    `${API_BASE_URL}/health`,
  );

  if (!response.ok) {
    throw new Error(
      "Backend is unavailable.",
    );
  }

  return response.json();
}


export async function sendMessage({
  question,
  sessionId,
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/chat`,
    {
      method: "POST",

      headers: authHeaders({
        "Content-Type":
          "application/json",
      }),

      // No user_id: the backend reads the user from the token.
      body: JSON.stringify({
        question,
        session_id:
          sessionId || null,
      }),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "The assistant could not process your message.",
      );

    throw new Error(message);
  }

  return response.json();
}


export async function transcribeAudio({
  audioBlob,
  languageCode,
}) {
  if (
    !audioBlob ||
    audioBlob.size === 0
  ) {
    throw new Error(
      "No microphone recording was captured.",
    );
  }

  const formData =
    new FormData();

  const isOgg =
    audioBlob.type.includes("ogg");

  const extension =
    isOgg ? "ogg" : "webm";

  /*
   * This must match:
   *
   * audio: UploadFile = File(...)
   */
  formData.append(
    "audio",
    audioBlob,
    `voice-recording.${extension}`,
  );

  formData.append(
    "language_code",
    languageCode || "en-IN",
  );

  const response = await fetch(
    `${API_BASE_URL}/api/stt`,
    {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    },
  );

  /*
   * Do not manually set Content-Type.
   * The browser creates the multipart boundary.
   */

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Speech transcription failed.",
      );

    throw new Error(message);
  }

  return response.json();
}


export async function synthesizeSpeech({
  text,
  languageCode,
}) {
  const cleanText = text?.trim();

  if (!cleanText) {
    throw new Error(
      "Text is required for speech generation.",
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/api/tts`,
    {
      method: "POST",

      headers: authHeaders({
        "Content-Type":
          "application/json",
      }),

      body: JSON.stringify({
        text: cleanText,
        language_code:
          languageCode || "en-IN",
      }),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Voice generation failed.",
      );

    throw new Error(message);
  }

  return response.blob();
}


/* ----- Authentication ----- */


/*
 * Create a new account. On success the backend returns a token
 * (register logs you straight in), so we save it immediately.
 */
export async function register({
  email,
  password,
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Registration failed.",
      );

    throw new Error(message);
  }

  const data =
    await response.json();

  setToken(data.access_token);

  return data;
}


/*
 * Log in with an existing account and save the returned token.
 */
export async function login({
  email,
  password,
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Login failed.",
      );

    throw new Error(message);
  }

  const data =
    await response.json();

  setToken(data.access_token);

  return data;
}


/*
 * Ask the backend "who am I?" using the stored token.
 * Used on app start to check whether we're already logged in.
 */
export async function getMe() {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/me`,
    {
      headers: authHeaders(),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Could not load your account.",
      );

    throw new Error(message);
  }

  return response.json();
}


/*
 * Log out: there's no server call needed for JWTs — we simply
 * throw away the token, so the browser can no longer prove who it is.
 */
export function logout() {
  clearToken();
}


/* ----- Conversation history ----- */


/*
 * List the logged-in user's saved conversations (newest first).
 */
export async function getConversations() {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations`,
    {
      headers: authHeaders(),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Could not load your conversations.",
      );

    throw new Error(message);
  }

  return response.json();
}


/*
 * Load one conversation's messages (and its session_id, so it can be
 * continued).
 */
export async function getConversationMessages(
  conversationId,
) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}`,
    {
      headers: authHeaders(),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Could not open that conversation.",
      );

    throw new Error(message);
  }

  return response.json();
}


/*
 * Ask the backend to email a reset link. The backend always responds the
 * same way (whether or not the email exists), so we just return its message.
 */
export async function requestPasswordReset(
  email,
) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/forgot-password`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({ email }),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Could not start the password reset.",
      );

    throw new Error(message);
  }

  return response.json();
}


/*
 * Complete the reset with the token from the emailed link + a new password.
 */
export async function resetPassword({
  token,
  password,
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        token,
        password,
      }),
    },
  );

  if (!response.ok) {
    const message =
      await getErrorMessage(
        response,
        "Could not reset the password.",
      );

    throw new Error(message);
  }

  return response.json();
}