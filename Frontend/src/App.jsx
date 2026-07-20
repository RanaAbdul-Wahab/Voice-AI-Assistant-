import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  checkBackendHealth,
  sendMessage,
  synthesizeSpeech,
  transcribeAudio,
} from "./services/api";

import "./App.css";


const USER_ID = "abdul-wahab";

const SILENCE_DURATION_MS = 1300;
const MIN_RECORDING_DURATION_MS = 700;
const MAX_RECORDING_DURATION_MS = 50_000;
const SPEECH_THRESHOLD = 0.018;


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
  const [question, setQuestion] =
    useState("");

  const [messages, setMessages] =
    useState([
      createMessage(
        "assistant",
        "Hello! Type a message or start a voice call.",
      ),
    ]);

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
    backendStatus,
    setBackendStatus,
  ] = useState("checking");

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


  useEffect(() => {
    async function testBackend() {
      try {
        await checkBackendHealth();

        setBackendStatus(
          "connected",
        );
      } catch {
        setBackendStatus(
          "disconnected",
        );
      }
    }

    void testBackend();
  }, []);


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


  async function handleTextSubmit(
    event,
  ) {
    event.preventDefault();

    const cleanQuestion =
      question.trim();

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
          userId: USER_ID,
          sessionId:
            textSessionId,
        });

      saveTextSession(
        result.session_id,
      );

      setBackendStatus(
        "connected",
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
    } catch (requestError) {
      setBackendStatus(
        "disconnected",
      );

      setError(
        requestError.message ||
          "The message could not be sent.",
      );
    } finally {
      setIsTextLoading(false);
    }
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
          userId: USER_ID,
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
    setQuestion("");
    setError("");

    setMessages([
      createMessage(
        "assistant",
        "New conversation started. Type a message or start a voice call.",
      ),
    ]);
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


  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            VA
          </div>

          <div>
            <strong>
              AI Assistant
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
          <span>＋</span>

          New conversation
        </button>


        <div className="sidebar-section">
          <p className="sidebar-heading">
            Capabilities
          </p>

          <div className="capability">
            <span>◫</span>

            Company-policy RAG
          </div>

          <div className="capability">
            <span>⌕</span>

            Current web search
          </div>

          <div className="capability">
            <span>☎</span>

            AI voice calls
          </div>
        </div>


        <div className="sidebar-bottom">
          <div
            className={
              `backend-status ${backendStatus}`
            }
          >
            <span className="status-dot" />

            <div>
              <strong>
                {backendStatus ===
                "connected"
                  ? "Backend online"
                  : backendStatus ===
                      "checking"
                    ? "Checking backend"
                    : "Backend offline"}
              </strong>

              <small>
                FastAPI · LangGraph
              </small>
            </div>
          </div>
        </div>
      </aside>


      <section className="chat-workspace">
        <header className="topbar">
          <div>
            <h1>
              AI Assistant
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
                      ? "AI"
                      : "You"}
                  </div>

                  <div className="message-content">
                    <div className="message-heading">
                      <strong>
                        {message.role ===
                        "assistant"
                          ? "Assistant"
                          : "You"}
                      </strong>

                      <span>
                        {message.createdAt}
                      </span>
                    </div>

                    <div className="message-body">
                      {message.text}
                    </div>
                  </div>
                </article>
              ),
            )}


            {isTextLoading && (
              <article className="message assistant">
                <div className="avatar">
                  AI
                </div>

                <div className="message-content">
                  <div className="message-heading">
                    <strong>
                      Assistant
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
                🎙
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
                ➜
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
                AI
              </div>

              <div>
                <strong>
                  AI Voice Call
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
                AI
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
                  ■
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
              <span>☎</span>

              End call
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}


export default App;