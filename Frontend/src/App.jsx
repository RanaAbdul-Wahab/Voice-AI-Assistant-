import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getConversationMessages,
  getConversations,
  getMe,
  getToken,
  logout,
  sendMessage,
  synthesizeSpeech,
  transcribeAudio,
} from "./services/api";

import AuthScreen from "./components/AuthScreen";
import CopyButton from "./components/CopyButton";
import MessageMarkdown from "./components/MessageMarkdown";
import ResetPasswordScreen from "./components/ResetPasswordScreen";

import "./App.css";


const SILENCE_DURATION_MS = 1300;
const MIN_RECORDING_DURATION_MS = 700;
const MAX_RECORDING_DURATION_MS = 50_000;
const SPEECH_THRESHOLD = 0.018;


/*
 * Suggested starter prompts shown on the welcome screen.
 *
 * `icon` is one of the keys handled by <PromptIcon> below.
 * Clicking a card sends `text` straight to the assistant.
 */
const SUGGESTED_PROMPTS = [
  {
    icon: "document",
    title: "Summarize the maternity policy",
    text: "Summarize our company maternity leave policy.",
  },
  {
    icon: "document",
    title: "Travel & TADA reimbursement",
    text: "What are the travel and TADA reimbursement rules?",
  },
  {
    icon: "search",
    title: "Latest AI news",
    text: "What are the latest developments in AI this week?",
  },
  {
    icon: "edit",
    title: "Draft an out-of-office email",
    text: "Draft a professional out-of-office email for a one-week leave.",
  },
];


function PromptIcon({ name }) {
  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}


function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}


function getCurrentTime() {
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}


// Turn a stored SQLite timestamp ("2026-07-21 05:03:56", UTC) into a
// local HH:MM string. Falls back to "" if it can't be parsed.
function formatStoredTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(
    value.replace(" ", "T") + "Z",
  );

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}


function createMessage(role, text) {
  return {
    id: createId(),
    role,
    text,
    createdAt: getCurrentTime(),
  };
}


function getRecordingMimeType() {
  if (
    typeof MediaRecorder === "undefined"
  ) {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];

  return (
    candidates.find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) || ""
  );
}


function formatDuration(totalSeconds) {
  const minutes = Math.floor(
    totalSeconds / 60,
  );

  const seconds =
    totalSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}


function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds,
    );
  });
}


function App() {
  /*
   * Auth state.
   *   authStatus: "checking" (still verifying) | "authed" | "guest"
   *   currentUser: { user_id, email } once logged in, else null
   */
  const [authStatus, setAuthStatus] =
    useState("checking");

  const [currentUser, setCurrentUser] =
    useState(null);

  // Saved conversations (sidebar list) + which one is open.
  const [conversations, setConversations] =
    useState([]);

  const [
    activeConversationId,
    setActiveConversationId,
  ] = useState(null);

  // If the app was opened from a reset link (?reset_token=...), grab it.
  const [resetToken, setResetToken] =
    useState(() =>
      new URLSearchParams(
        window.location.search,
      ).get("reset_token") || "",
    );

  const [question, setQuestion] =
    useState("");

  const [messages, setMessages] =
    useState([]);

  const [
    textSessionId,
    setTextSessionId,
  ] = useState(() => {
    return (
      localStorage.getItem(
        "text_chat_session_id",
      ) || ""
    );
  });

  const [
    languageCode,
    setLanguageCode,
  ] = useState("en-IN");

  const [
    isTextLoading,
    setIsTextLoading,
  ] = useState(false);

  const [error, setError] =
    useState("");

  /*
   * Voice-call state.
   */
  const [callOpen, setCallOpen] =
    useState(false);

  const [callPhase, setCallPhase] =
    useState("idle");

  const [callError, setCallError] =
    useState("");

  const [
    callDuration,
    setCallDuration,
  ] = useState(0);

  const [microphoneSupported] =
    useState(() => {
      return Boolean(
        navigator.mediaDevices
          ?.getUserMedia &&
          typeof MediaRecorder !==
            "undefined",
      );
    });

  /*
   * Text-chat references.
   */
  const messagesEndRef =
    useRef(null);

  /*
   * Voice-call references.
   */
  const callActiveRef =
    useRef(false);

  const callTokenRef =
    useRef(0);

  const voiceSessionIdRef =
    useRef("");

  const mediaStreamRef =
    useRef(null);

  const recorderRef =
    useRef(null);

  const discardRecordingRef =
    useRef(false);

  const analyserRef =
    useRef(null);

  const analyserSourceRef =
    useRef(null);

  const silenceFrameRef =
    useRef(null);

  const recordingTimeoutRef =
    useRef(null);

  const audioContextRef =
    useRef(null);

  const audioSourceRef =
    useRef(null);


  /*
   * On startup, decide if we're already logged in.
   * If a token exists, ask the backend (getMe) whether it's still valid.
   */
  useEffect(() => {
    async function restoreSession() {
      if (!getToken()) {
        setAuthStatus("guest");
        return;
      }

      try {
        const user = await getMe();

        setCurrentUser({
          user_id: user.user_id,
          email: user.email,
        });

        setAuthStatus("authed");
      } catch {
        // Token missing / expired / invalid -> treat as logged out.
        logout();
        setCurrentUser(null);
        setAuthStatus("guest");
      }
    }

    void restoreSession();
  }, []);


  // Once logged in, load the sidebar's list of saved conversations.
  useEffect(() => {
    if (authStatus !== "authed") {
      return;
    }

    void refreshConversations();
  }, [authStatus]);


  useEffect(() => {
    messagesEndRef.current
      ?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
  }, [
    messages,
    isTextLoading,
  ]);


  useEffect(() => {
    if (!callOpen) {
      setCallDuration(0);
      return undefined;
    }

    const startedAt = Date.now();

    const timer = window.setInterval(
      () => {
        const elapsedSeconds =
          Math.floor(
            (
              Date.now() -
              startedAt
            ) / 1000,
          );

        setCallDuration(
          elapsedSeconds,
        );
      },
      1000,
    );

    return () => {
      window.clearInterval(timer);
    };
  }, [callOpen]);


  useEffect(() => {
    return () => {
      callActiveRef.current =
        false;

      callTokenRef.current += 1;

      cleanupRecordingDetection();
      stopAssistantAudio();
      stopMicrophoneStream();

      if (
        audioContextRef.current
      ) {
        void audioContextRef
          .current
          .close();
      }
    };
  }, []);


  function getAudioContext() {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error(
        "Audio playback is not supported in this browser.",
      );
    }

    audioContextRef.current =
      new AudioContextClass();

    return audioContextRef.current;
  }


  async function unlockAudio() {
    const audioContext =
      getAudioContext();

    if (
      audioContext.state ===
      "suspended"
    ) {
      await audioContext.resume();
    }
  }


  function isCallActive(token) {
    return (
      callActiveRef.current &&
      callTokenRef.current === token
    );
  }


  function enableMicrophoneTracks(
    enabled,
  ) {
    mediaStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled = enabled;
      });
  }


  function cleanupRecordingDetection() {
    if (silenceFrameRef.current) {
      window.cancelAnimationFrame(
        silenceFrameRef.current,
      );

      silenceFrameRef.current =
        null;
    }

    if (
      recordingTimeoutRef.current
    ) {
      window.clearTimeout(
        recordingTimeoutRef.current,
      );

      recordingTimeoutRef.current =
        null;
    }
  }


  function stopMicrophoneStream() {
    cleanupRecordingDetection();

    if (
      analyserSourceRef.current
    ) {
      try {
        analyserSourceRef.current
          .disconnect();
      } catch {
        // The source may already be disconnected.
      }
    }

    analyserSourceRef.current =
      null;

    analyserRef.current =
      null;

    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    mediaStreamRef.current =
      null;
  }


  function stopAssistantAudio() {
    const source =
      audioSourceRef.current;

    if (source) {
      try {
        source.stop();
      } catch {
        // Audio may already have ended.
      }
    }

    audioSourceRef.current =
      null;
  }


  /*
   * Stops the current AI voice response,
   * but keeps the voice call open.
   *
   * Stopping the AudioBufferSource triggers
   * its onended callback. The active voice
   * process then automatically returns to
   * microphone listening.
   */
  function interruptAssistant() {
    if (
      !callActiveRef.current ||
      callPhase !== "speaking"
    ) {
      return;
    }

    setCallPhase("resuming");

    stopAssistantAudio();
  }


  async function playAssistantAudio(
    audioBlob,
    token,
  ) {
    if (!isCallActive(token)) {
      return;
    }

    const audioContext =
      getAudioContext();

    if (
      audioContext.state ===
      "suspended"
    ) {
      await audioContext.resume();
    }

    const audioArrayBuffer =
      await audioBlob.arrayBuffer();

    const audioBuffer =
      await audioContext
        .decodeAudioData(
          audioArrayBuffer.slice(0),
        );

    if (!isCallActive(token)) {
      return;
    }

    stopAssistantAudio();

    const source =
      audioContext
        .createBufferSource();

    source.buffer = audioBuffer;

    source.connect(
      audioContext.destination,
    );

    audioSourceRef.current =
      source;

    setCallPhase("speaking");

    await new Promise((resolve) => {
      let finished = false;

      function finishPlayback() {
        if (finished) {
          return;
        }

        finished = true;

        if (
          audioSourceRef.current ===
          source
        ) {
          audioSourceRef.current =
            null;
        }

        resolve();
      }

      source.onended =
        finishPlayback;

      try {
        source.start(0);
      } catch {
        finishPlayback();
      }
    });
  }


  function saveTextSession(
    sessionId,
  ) {
    if (!sessionId) {
      return;
    }

    setTextSessionId(sessionId);

    localStorage.setItem(
      "text_chat_session_id",
      sessionId,
    );
  }


  /*
   * Shared send path used by both the composer form and the
   * welcome-screen prompt cards. `rawText` is the message to send.
   */
  async function submitQuestion(rawText) {
    const cleanQuestion =
      (rawText || "").trim();

    if (
      !cleanQuestion ||
      isTextLoading ||
      callOpen
    ) {
      return;
    }

    setError("");

    setMessages(
      (currentMessages) => [
        ...currentMessages,
        createMessage(
          "user",
          cleanQuestion,
        ),
      ],
    );

    setQuestion("");
    setIsTextLoading(true);

    try {
      const result =
        await sendMessage({
          question: cleanQuestion,
          sessionId:
            textSessionId,
        });

      saveTextSession(
        result.session_id,
      );

      setMessages(
        (currentMessages) => [
          ...currentMessages,
          createMessage(
            "assistant",
            result.answer,
          ),
        ],
      );

      // Track / refresh the conversation this message belongs to.
      if (result.conversation_id) {
        setActiveConversationId(
          result.conversation_id,
        );
      }

      void refreshConversations();
    } catch (requestError) {
      setError(
        requestError.message ||
          "The message could not be sent.",
      );
    } finally {
      setIsTextLoading(false);
    }
  }


  function handleTextSubmit(event) {
    event.preventDefault();

    void submitQuestion(question);
  }


  function handleTextKeyDown(
    event,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      if (
        question.trim() &&
        !isTextLoading
      ) {
        event.currentTarget
          .form
          .requestSubmit();
      }
    }
  }


  async function beginVoiceCall() {
    if (!microphoneSupported) {
      setError(
        "Microphone recording is not supported in this browser.",
      );

      return;
    }

    if (
      isTextLoading ||
      callOpen
    ) {
      return;
    }

    setError("");
    setCallError("");
    setCallPhase("connecting");

    const token =
      callTokenRef.current + 1;

    callTokenRef.current =
      token;

    callActiveRef.current =
      true;

    voiceSessionIdRef.current =
      "";

    setCallOpen(true);

    try {
      await unlockAudio();

      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
          });

      if (!isCallActive(token)) {
        stream
          .getTracks()
          .forEach((track) => {
            track.stop();
          });

        return;
      }

      mediaStreamRef.current =
        stream;

      const audioContext =
        getAudioContext();

      const source =
        audioContext
          .createMediaStreamSource(
            stream,
          );

      const analyser =
        audioContext
          .createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant =
        0.25;

      source.connect(analyser);

      analyserSourceRef.current =
        source;

      analyserRef.current =
        analyser;

      await startRecordingCycle(
        token,
      );
    } catch (recordingError) {
      if (!isCallActive(token)) {
        return;
      }

      stopMicrophoneStream();

      setCallPhase("error");

      if (
        recordingError.name ===
        "NotAllowedError"
      ) {
        setCallError(
          "Microphone permission was denied. Allow microphone access and try again.",
        );

        return;
      }

      if (
        recordingError.name ===
        "NotFoundError"
      ) {
        setCallError(
          "No microphone was found.",
        );

        return;
      }

      setCallError(
        recordingError.message ||
          "The voice call could not be started.",
      );
    }
  }


  async function startRecordingCycle(
    token,
  ) {
    if (!isCallActive(token)) {
      return;
    }

    const stream =
      mediaStreamRef.current;

    const analyser =
      analyserRef.current;

    if (!stream || !analyser) {
      setCallPhase("error");

      setCallError(
        "The microphone connection was lost.",
      );

      return;
    }

    cleanupRecordingDetection();

    setCallError("");
    setCallPhase("listening");

    enableMicrophoneTracks(true);

    discardRecordingRef.current =
      false;

    const mimeType =
      getRecordingMimeType();

    const recorder = mimeType
      ? new MediaRecorder(
          stream,
          {
            mimeType,
            audioBitsPerSecond:
              128000,
          },
        )
      : new MediaRecorder(stream);

    recorderRef.current =
      recorder;

    const chunks = [];

    let heardSpeech = false;
    let silenceStartedAt = null;

    const recordingStartedAt =
      performance.now();

    recorder.ondataavailable = (
      event,
    ) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };


    recorder.onerror = () => {
      cleanupRecordingDetection();

      if (!isCallActive(token)) {
        return;
      }

      setCallPhase("error");

      setCallError(
        "Microphone recording failed.",
      );
    };


    recorder.onstop = () => {
      cleanupRecordingDetection();

      enableMicrophoneTracks(false);

      recorderRef.current =
        null;

      if (!isCallActive(token)) {
        return;
      }

      const shouldDiscard =
        discardRecordingRef.current;

      discardRecordingRef.current =
        false;

      const audioBlob =
        new Blob(chunks, {
          type:
            recorder.mimeType ||
            "audio/webm",
        });

      if (
        shouldDiscard ||
        !heardSpeech ||
        !audioBlob.size
      ) {
        window.setTimeout(
          () => {
            void startRecordingCycle(
              token,
            );
          },
          250,
        );

        return;
      }

      void processVoiceTurn(
        audioBlob,
        token,
      );
    };


    recorder.start(250);

    const audioData =
      new Uint8Array(
        analyser.fftSize,
      );


    function finishCurrentTurn() {
      if (
        recorder.state !==
        "recording"
      ) {
        return;
      }

      cleanupRecordingDetection();

      setCallPhase(
        "transcribing",
      );

      recorder.stop();
    }


    function monitorSilence() {
      if (
        !isCallActive(token) ||
        recorder.state !==
          "recording"
      ) {
        return;
      }

      analyser
        .getByteTimeDomainData(
          audioData,
        );

      let sumSquares = 0;

      for (
        let index = 0;
        index < audioData.length;
        index += 1
      ) {
        const normalizedSample =
          (
            audioData[index] -
            128
          ) / 128;

        sumSquares +=
          normalizedSample *
          normalizedSample;
      }

      const rms = Math.sqrt(
        sumSquares /
          audioData.length,
      );

      const now =
        performance.now();

      const elapsed =
        now -
        recordingStartedAt;

      if (
        rms >
        SPEECH_THRESHOLD
      ) {
        heardSpeech = true;

        silenceStartedAt =
          null;
      } else if (
        heardSpeech &&
        elapsed >
          MIN_RECORDING_DURATION_MS
      ) {
        if (
          silenceStartedAt ===
          null
        ) {
          silenceStartedAt =
            now;
        }

        if (
          now -
            silenceStartedAt >=
          SILENCE_DURATION_MS
        ) {
          finishCurrentTurn();
          return;
        }
      }

      silenceFrameRef.current =
        window.requestAnimationFrame(
          monitorSilence,
        );
    }


    silenceFrameRef.current =
      window.requestAnimationFrame(
        monitorSilence,
      );


    recordingTimeoutRef.current =
      window.setTimeout(
        () => {
          if (
            recorder.state !==
            "recording"
          ) {
            return;
          }

          if (!heardSpeech) {
            discardRecordingRef.current =
              true;
          } else {
            setCallPhase(
              "transcribing",
            );
          }

          recorder.stop();
        },
        MAX_RECORDING_DURATION_MS,
      );
  }


  async function processVoiceTurn(
    audioBlob,
    token,
  ) {
    try {
      if (!isCallActive(token)) {
        return;
      }

      setCallPhase(
        "transcribing",
      );

      const transcription =
        await transcribeAudio({
          audioBlob,
          languageCode,
        });

      if (!isCallActive(token)) {
        return;
      }

      const transcript = (
        transcription.transcript ||
        transcription.text ||
        ""
      ).trim();

      if (!transcript) {
        throw new Error(
          "No speech was detected.",
        );
      }

      setCallPhase("thinking");

      const agentResult =
        await sendMessage({
          question: transcript,
          sessionId:
            voiceSessionIdRef.current,
        });

      if (!isCallActive(token)) {
        return;
      }

      if (
        agentResult.session_id
      ) {
        voiceSessionIdRef.current =
          agentResult.session_id;
      }

      const answer =
        agentResult.answer?.trim();

      if (!answer) {
        throw new Error(
          "The assistant returned an empty response.",
        );
      }

      setCallPhase(
        "preparing",
      );

      const speechBlob =
        await synthesizeSpeech({
          text: answer,
          languageCode,
        });

      if (!isCallActive(token)) {
        return;
      }

      await playAssistantAudio(
        speechBlob,
        token,
      );

      if (!isCallActive(token)) {
        return;
      }

      setCallPhase("resuming");

      await delay(250);

      if (isCallActive(token)) {
        await startRecordingCycle(
          token,
        );
      }
    } catch (voiceError) {
      if (!isCallActive(token)) {
        return;
      }

      setCallPhase("error");

      setCallError(
        voiceError.message ||
          "The voice conversation failed.",
      );
    }
  }


  async function retryVoiceCall() {
    if (
      !callActiveRef.current
    ) {
      return;
    }

    const token =
      callTokenRef.current;

    setCallError("");

    await startRecordingCycle(
      token,
    );
  }


  function closeVoiceCall() {
    callActiveRef.current =
      false;

    callTokenRef.current += 1;

    discardRecordingRef.current =
      true;

    cleanupRecordingDetection();

    const recorder =
      recorderRef.current;

    if (
      recorder &&
      recorder.state !==
        "inactive"
    ) {
      try {
        recorder.stop();
      } catch {
        // Recorder may already be stopping.
      }
    }

    recorderRef.current =
      null;

    stopAssistantAudio();
    stopMicrophoneStream();

    voiceSessionIdRef.current =
      "";

    setCallOpen(false);
    setCallPhase("idle");
    setCallError("");
  }


  function startNewConversation() {
    if (callOpen) {
      closeVoiceCall();
    }

    localStorage.removeItem(
      "text_chat_session_id",
    );

    setTextSessionId("");
    setActiveConversationId(null);
    setQuestion("");
    setError("");

    // The previous chat is safely saved in the sidebar list — not lost.
    setMessages([]);
  }


  // Reload the sidebar list (after login, and after each new message).
  async function refreshConversations() {
    try {
      const list = await getConversations();
      setConversations(list);
    } catch {
      // Non-critical — leave the current list as-is.
    }
  }


  // Open a saved conversation: load its messages and reuse its session so
  // the user can continue it.
  async function loadConversation(conversationId) {
    if (callOpen || isTextLoading) {
      return;
    }

    setError("");

    try {
      const detail = await getConversationMessages(
        conversationId,
      );

      const loadedMessages = detail.messages.map(
        (message) => ({
          id: createId(),
          role: message.role,
          text: message.text,
          createdAt: formatStoredTime(
            message.created_at,
          ),
        }),
      );

      setMessages(loadedMessages);
      setActiveConversationId(conversationId);

      // Reuse the session so the next message appends to THIS conversation.
      saveTextSession(detail.session_id);
    } catch (loadError) {
      setError(
        loadError.message ||
          "Could not open that conversation.",
      );
    }
  }


  /*
   * Called by <ResetPasswordScreen> to leave the reset flow: strip the
   * ?reset_token=... from the URL and fall back to the login screen.
   */
  function handleResetDone() {
    window.history.replaceState(
      {},
      "",
      window.location.pathname,
    );

    setResetToken("");
  }


  /*
   * Called by <AuthScreen> after a successful login or register.
   */
  function handleAuthenticated(user) {
    setCurrentUser({
      user_id: user.user_id,
      email: user.email,
    });

    setAuthStatus("authed");
  }


  function handleLogout() {
    if (callOpen) {
      closeVoiceCall();
    }

    // Throw away the token.
    logout();

    // Forget this user's conversation so the next login starts clean.
    localStorage.removeItem(
      "text_chat_session_id",
    );

    setTextSessionId("");
    setActiveConversationId(null);
    setConversations([]);
    setMessages([]);
    setQuestion("");
    setError("");

    setCurrentUser(null);
    setAuthStatus("guest");
  }


  const callStatus = {
    connecting:
      "Connecting to your microphone…",

    listening:
      "Listening…",

    transcribing:
      "Understanding what you said…",

    thinking:
      "Thinking…",

    preparing:
      "Preparing voice response…",

    speaking:
      "AI is speaking…",

    resuming:
      "Returning to listening…",

    error:
      "Voice call paused",

    idle:
      "Ready",
  }[callPhase];


  const callDescription = {
    connecting:
      "Please allow microphone access.",

    listening:
      "Speak naturally. The assistant will respond when you stop speaking.",

    transcribing:
      "Converting your voice into text.",

    thinking:
      "The assistant is preparing an answer.",

    preparing:
      "Generating the spoken response.",

    speaking:
      "Press Interrupt to stop the response and ask another question.",

    resuming:
      "The microphone will start listening again.",

    error:
      callError,

    idle:
      "",
  }[callPhase];


  // Still checking for an existing token: show a tiny placeholder.
  if (authStatus === "checking") {
    return (
      <main className="auth-screen">
        <div className="auth-loading">
          Loading…
        </div>
      </main>
    );
  }

  // Opened from a reset link: show the "set new password" screen.
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={handleResetDone}
      />
    );
  }

  // Not logged in: show the login / sign-up screen instead of the app.
  if (authStatus !== "authed") {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
      />
    );
  }


  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            A
          </div>

          <div>
            <strong>
              Aria
            </strong>

            <span>
              Text and voice
            </span>
          </div>
        </div>


        <button
          type="button"
          className="new-chat-button"
          onClick={
            startNewConversation
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>

          New conversation
        </button>


        {conversations.length > 0 && (
          <div className="sidebar-section">
            <p className="sidebar-heading">
              Recent
            </p>

            <div className="conversation-list">
              {conversations.map(
                (conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    className={
                      conversation.id ===
                      activeConversationId
                        ? "conversation-item active"
                        : "conversation-item"
                    }
                    onClick={() =>
                      loadConversation(
                        conversation.id,
                      )
                    }
                    disabled={callOpen}
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                ),
              )}
            </div>
          </div>
        )}


        <div className="sidebar-section">
          <p className="sidebar-heading">
            Capabilities
          </p>

          <div className="capability">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
                <path d="M9 13h6M9 17h6" />
              </svg>
            </span>

            Company-policy RAG
          </div>

          <div className="capability">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>

            Current web search
          </div>

          <div className="capability">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </span>

            Calendar scheduling
          </div>

          <div className="capability">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </span>

            Email drafting &amp; sending
          </div>

          <div className="capability">
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>

            AI voice calls
          </div>
        </div>


        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <span className="sidebar-user-avatar">
                {currentUser.email
                  .slice(0, 1)
                  .toUpperCase()}
              </span>

              <span className="sidebar-user-email">
                {currentUser.email}
              </span>
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>


      <section className="chat-workspace">
        <header className="topbar">
          <div>
            <h1>
              Aria
            </h1>

            <p>
              Type for text chat or use the microphone for a voice call.
            </p>
          </div>


          <label className="language-control">
            <span>
              Voice language
            </span>

            <select
              value={languageCode}
              onChange={(event) =>
                setLanguageCode(
                  event.target.value,
                )
              }
              disabled={callOpen}
            >
              <option value="en-IN">
                English — South Asian
              </option>

              <option value="en-US">
                English — United States
              </option>

              <option value="ur-PK">
                Urdu — Pakistan
              </option>
            </select>
          </label>
        </header>


        <section className="conversation">
          {messages.length === 0 &&
          !isTextLoading ? (
            <div className="welcome">
              <div className="welcome-mark">
                A
              </div>

              <h2>
                How can I help you today?
              </h2>

              <p>
                Ask about company policies, search the web for
                current information, or start a voice call.
              </p>

              <div className="prompt-grid">
                {SUGGESTED_PROMPTS.map(
                  (prompt) => (
                    <button
                      key={prompt.title}
                      type="button"
                      className="prompt-card"
                      onClick={() =>
                        submitQuestion(
                          prompt.text,
                        )
                      }
                      disabled={callOpen}
                    >
                      <span className="prompt-card-icon">
                        <PromptIcon
                          name={prompt.icon}
                        />
                      </span>

                      <span className="prompt-card-text">
                        <strong>
                          {prompt.title}
                        </strong>

                        <span>
                          {prompt.text}
                        </span>
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="conversation-inner">
            {messages.map(
              (message) => (
                <article
                  key={message.id}
                  className={
                    `message ${message.role}`
                  }
                >
                  <div className="avatar">
                    {message.role ===
                    "assistant"
                      ? "A"
                      : "You"}
                  </div>

                  <div className="message-content">
                    <div className="message-heading">
                      <strong>
                        {message.role ===
                        "assistant"
                          ? "Aria"
                          : "You"}
                      </strong>

                      <span>
                        {message.createdAt}
                      </span>
                    </div>

                    <div
                      className={
                        message.role ===
                        "assistant"
                          ? "message-body markdown"
                          : "message-body"
                      }
                    >
                      {message.role ===
                      "assistant" ? (
                        <MessageMarkdown>
                          {message.text}
                        </MessageMarkdown>
                      ) : (
                        message.text
                      )}
                    </div>

                    {message.role ===
                      "assistant" && (
                      <CopyButton
                        text={message.text}
                      />
                    )}
                  </div>
                </article>
              ),
            )}


            {isTextLoading && (
              <article className="message assistant">
                <div className="avatar">
                  A
                </div>

                <div className="message-content">
                  <div className="message-heading">
                    <strong>
                      Aria
                    </strong>
                  </div>

                  <div className="thinking-card">
                    <div className="thinking-dots">
                      <span />
                      <span />
                      <span />
                    </div>

                    <p>
                      Thinking…
                    </p>
                  </div>
                </div>
              </article>
            )}


            <div ref={messagesEndRef} />
            </div>
          )}
        </section>


        <footer className="composer-area">
          {error && (
            <div className="error-banner">
              <span>{error}</span>

              <button
                type="button"
                onClick={() =>
                  setError("")
                }
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}


          <form
            className="composer"
            onSubmit={
              handleTextSubmit
            }
          >
            <textarea
              rows={1}
              value={question}
              onChange={(event) =>
                setQuestion(
                  event.target.value,
                )
              }
              onKeyDown={
                handleTextKeyDown
              }
              placeholder="Message your AI assistant…"
              disabled={
                isTextLoading ||
                callOpen
              }
            />


            <div className="composer-actions">
              <button
                type="button"
                className="call-button"
                onClick={
                  beginVoiceCall
                }
                disabled={
                  isTextLoading ||
                  callOpen ||
                  !microphoneSupported
                }
                aria-label="Start voice call"
                title="Start voice call"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <path d="M12 19v3" />
                </svg>
              </button>

              <button
                type="submit"
                className="send-button"
                disabled={
                  !question.trim() ||
                  isTextLoading ||
                  callOpen
                }
                aria-label="Send text message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            </div>
          </form>

          <p className="composer-note">
            Typed messages receive text responses only
          </p>
        </footer>
      </section>


      {callOpen && (
        <section className="voice-call-overlay">
          <header className="voice-call-header">
            <div className="voice-call-title">
              <div className="call-mini-avatar">
                A
              </div>

              <div>
                <strong>
                  Aria Voice Call
                </strong>

                <span>
                  {formatDuration(
                    callDuration,
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="call-close-button"
              onClick={
                closeVoiceCall
              }
              aria-label="Close voice call"
              title="Close voice call"
            >
              ×
            </button>
          </header>


          <div className="voice-call-content">
            <div
              className={
                `call-avatar-container ${callPhase}`
              }
            >
              <span className="call-ring ring-one" />
              <span className="call-ring ring-two" />
              <span className="call-ring ring-three" />

              <div className="call-avatar">
                A
              </div>
            </div>


            <h2>
              {callStatus}
            </h2>

            <p className="call-description">
              {callDescription}
            </p>


            <div
              className={
                `call-waveform ${callPhase}`
              }
              aria-hidden="true"
            >
              {Array.from(
                { length: 18 },
                (_, index) => (
                  <span
                    key={index}
                    style={{
                      animationDelay:
                        `${index * 0.06}s`,
                    }}
                  />
                ),
              )}
            </div>


            {callPhase ===
              "error" && (
              <button
                type="button"
                className="retry-call-button"
                onClick={
                  retryVoiceCall
                }
              >
                Try again
              </button>
            )}
          </div>


          <footer className="voice-call-actions">
            {callPhase ===
              "speaking" && (
              <button
                type="button"
                className="interrupt-button"
                onClick={
                  interruptAssistant
                }
                aria-label="Interrupt assistant"
                title="Stop AI voice and continue speaking"
              >
                <span className="interrupt-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </span>

                Interrupt
              </button>
            )}

            <button
              type="button"
              className="hangup-button"
              onClick={
                closeVoiceCall
              }
              aria-label="End voice call"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 8.63 15.4a19.42 19.42 0 0 1-3.33-4.53" />
                <path d="M22 2 2 22" />
              </svg>

              End call
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}


export default App;