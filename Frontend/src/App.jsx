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

const MAX_RECORDING_DURATION_MS =
  55_000;


function createId() {
  if (
    globalThis.crypto?.randomUUID
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}


function createAssistantMessage(
  text,
  additionalFields = {}
) {
  return {
    id: createId(),
    role: "assistant",
    text,
    agent: "",

    audioUrl: "",
    audioStatus: "idle",
    audioError: "",

    ...additionalFields,
  };
}


function getSupportedRecordingType() {
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
      MediaRecorder.isTypeSupported(type)
    ) || ""
  );
}


function App() {
  const [question, setQuestion] =
    useState("");

  const [messages, setMessages] =
    useState([
      createAssistantMessage(
        "Hello! You can type a question or record your voice."
      ),
    ]);

  const [sessionId, setSessionId] =
    useState(() => {
      return (
        localStorage.getItem(
          "agent_session_id"
        ) || ""
      );
    });

  const [
    backendStatus,
    setBackendStatus,
  ] = useState("checking");

  const [languageCode, setLanguageCode] =
    useState("en-IN");

  const [isLoading, setIsLoading] =
    useState(false);

  const [isRecording, setIsRecording] =
    useState(false);

  const [
    isTranscribing,
    setIsTranscribing,
  ] = useState(false);

  const [isSpeaking, setIsSpeaking] =
    useState(false);

  const [autoSpeak, setAutoSpeak] =
    useState(true);

  const [error, setError] =
    useState("");

  const [microphoneSupported] =
    useState(() => {
      return Boolean(
        navigator.mediaDevices
          ?.getUserMedia &&
        typeof MediaRecorder !==
          "undefined"
      );
    });


  const mediaRecorderRef =
    useRef(null);

  const mediaStreamRef =
    useRef(null);

  const audioChunksRef =
    useRef([]);

  const recordingTimeoutRef =
    useRef(null);

  const typedTextBeforeRecordingRef =
    useRef("");

  const audioElementRef =
    useRef(null);

  /*
   * Every generated object URL is stored here.
   * This allows audio to be reused without another
   * TTS request and released later.
   */
  const generatedAudioUrlsRef =
    useRef(new Set());

  /*
   * Incrementing this value invalidates any old
   * background TTS requests after a new chat or
   * language change.
   */
  const audioGenerationVersionRef =
    useRef(0);

  const messagesEndRef =
    useRef(null);


  useEffect(() => {
    async function testBackend() {
      try {
        await checkBackendHealth();

        setBackendStatus(
          "connected"
        );
      } catch {
        setBackendStatus(
          "disconnected"
        );
      }
    }

    testBackend();
  }, []);


  useEffect(() => {
    messagesEndRef.current
      ?.scrollIntoView({
        behavior: "smooth",
      });
  }, [
    messages,
    isLoading,
    isTranscribing,
  ]);


  useEffect(() => {
    return () => {
      if (
        recordingTimeoutRef.current
      ) {
        clearTimeout(
          recordingTimeoutRef.current
        );
      }

      if (
        mediaStreamRef.current
      ) {
        mediaStreamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });
      }

      const audio =
        audioElementRef.current;

      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }

      for (
        const audioUrl
        of generatedAudioUrlsRef.current
      ) {
        URL.revokeObjectURL(
          audioUrl
        );
      }

      generatedAudioUrlsRef.current.clear();
    };
  }, []);


  function clearRecordingTimeout() {
    if (
      !recordingTimeoutRef.current
    ) {
      return;
    }

    clearTimeout(
      recordingTimeoutRef.current
    );

    recordingTimeoutRef.current =
      null;
  }


  function stopMediaTracks() {
    if (!mediaStreamRef.current) {
      return;
    }

    mediaStreamRef.current
      .getTracks()
      .forEach((track) => {
        track.stop();
      });

    mediaStreamRef.current = null;
  }


  function updateMessageAudio(
    messageId,
    updates
  ) {
    setMessages(
      (currentMessages) =>
        currentMessages.map(
          (message) =>
            message.id === messageId
              ? {
                  ...message,
                  ...updates,
                }
              : message
        )
    );
  }


  function stopSpeaking() {
    const audio =
      audioElementRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    audioElementRef.current = null;

    setIsSpeaking(false);
  }


  function cleanupGeneratedAudio() {
    stopSpeaking();

    for (
      const audioUrl
      of generatedAudioUrlsRef.current
    ) {
      URL.revokeObjectURL(
        audioUrl
      );
    }

    generatedAudioUrlsRef.current.clear();
  }


  async function playPreparedAudio(
    audioUrl
  ) {
    if (!audioUrl) {
      return;
    }

    stopSpeaking();

    const audio =
      new Audio(audioUrl);

    audioElementRef.current =
      audio;

    audio.onplay = () => {
      setIsSpeaking(true);
      setError("");
    };

    audio.onended = () => {
      setIsSpeaking(false);
      audioElementRef.current = null;
    };

    audio.onerror = () => {
      setIsSpeaking(false);
      audioElementRef.current = null;

      setError(
        "The generated audio could not be played."
      );
    };

    try {
      await audio.play();
    } catch {
      setIsSpeaking(false);
      audioElementRef.current = null;

      setError(
        "The browser blocked automatic playback. Press the Speak button."
      );
    }
  }


  async function prepareMessageAudio({
    messageId,
    text,
    shouldAutoPlay = false,
  }) {
    const cleanText =
      text?.trim();

    if (!cleanText) {
      return;
    }

    const requestVersion =
      audioGenerationVersionRef.current;

    updateMessageAudio(
      messageId,
      {
        audioStatus: "loading",
        audioError: "",
      }
    );

    try {
      const audioBlob =
        await synthesizeSpeech({
          text: cleanText,
          languageCode,
        });

      /*
       * Ignore responses from an older chat
       * or an older language selection.
       */
      if (
        requestVersion !==
        audioGenerationVersionRef.current
      ) {
        return;
      }

      const audioUrl =
        URL.createObjectURL(
          audioBlob
        );

      generatedAudioUrlsRef.current.add(
        audioUrl
      );

      updateMessageAudio(
        messageId,
        {
          audioUrl,
          audioStatus: "ready",
          audioError: "",
        }
      );

      if (shouldAutoPlay) {
        await playPreparedAudio(
          audioUrl
        );
      }
    } catch (speechError) {
      if (
        requestVersion !==
        audioGenerationVersionRef.current
      ) {
        return;
      }

      updateMessageAudio(
        messageId,
        {
          audioUrl: "",
          audioStatus: "error",
          audioError:
            speechError.message ||
            "Audio generation failed.",
        }
      );
    }
  }


  async function startRecording() {
    if (!microphoneSupported) {
      setError(
        "Microphone recording is not supported in this browser."
      );

      return;
    }

    if (
      isRecording ||
      isTranscribing ||
      isLoading
    ) {
      return;
    }

    stopSpeaking();
    setError("");

    try {
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

      mediaStreamRef.current =
        stream;

      audioChunksRef.current = [];

      typedTextBeforeRecordingRef.current =
        question.trim();

      const mimeType =
        getSupportedRecordingType();

      const recorder = mimeType
        ? new MediaRecorder(
            stream,
            {
              mimeType,
              audioBitsPerSecond:
                128000,
            }
          )
        : new MediaRecorder(
            stream
          );

      mediaRecorderRef.current =
        recorder;

      recorder.ondataavailable = (
        event
      ) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(
            event.data
          );
        }
      };

      recorder.onerror = () => {
        clearRecordingTimeout();
        stopMediaTracks();

        setIsRecording(false);

        setError(
          "The browser could not record microphone audio."
        );
      };

      recorder.onstop =
        handleRecordingStopped;

      recorder.start(250);

      setIsRecording(true);

      recordingTimeoutRef.current =
        window.setTimeout(() => {
          stopRecording();
        }, MAX_RECORDING_DURATION_MS);
    } catch (recordingError) {
      stopMediaTracks();

      if (
        recordingError.name ===
        "NotAllowedError"
      ) {
        setError(
          "Microphone permission was denied. Allow microphone access in the browser."
        );

        return;
      }

      if (
        recordingError.name ===
        "NotFoundError"
      ) {
        setError(
          "No microphone was found."
        );

        return;
      }

      setError(
        `Could not start recording: ${recordingError.message}`
      );
    }
  }


  function stopRecording() {
    clearRecordingTimeout();

    const recorder =
      mediaRecorderRef.current;

    if (
      recorder &&
      recorder.state !== "inactive"
    ) {
      recorder.stop();
    }

    setIsRecording(false);
  }


  async function handleRecordingStopped() {
    clearRecordingTimeout();

    setIsRecording(false);

    const recorder =
      mediaRecorderRef.current;

    const mimeType =
      recorder?.mimeType ||
      "audio/webm";

    const audioBlob =
      new Blob(
        audioChunksRef.current,
        {
          type: mimeType,
        }
      );

    audioChunksRef.current = [];

    mediaRecorderRef.current =
      null;

    stopMediaTracks();

    if (!audioBlob.size) {
      setError(
        "No audio was recorded."
      );

      return;
    }

    setIsTranscribing(true);
    setError("");

    try {
      const result =
        await transcribeAudio({
          audioBlob,
          languageCode,
        });

      const existingText =
        typedTextBeforeRecordingRef
          .current;

      const completeQuestion = [
        existingText,
        result.transcript,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      setQuestion(
        completeQuestion
      );

      setBackendStatus(
        "connected"
      );
    } catch (
      transcriptionError
    ) {
      setError(
        transcriptionError.message
      );
    } finally {
      setIsTranscribing(false);
    }
  }


  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    const cleanQuestion =
      question.trim();

    if (
      !cleanQuestion ||
      isLoading ||
      isRecording ||
      isTranscribing
    ) {
      return;
    }

    stopSpeaking();

    setMessages(
      (currentMessages) => [
        ...currentMessages,
        {
          id: createId(),
          role: "user",
          text: cleanQuestion,
        },
      ]
    );

    setQuestion("");
    setError("");
    setIsLoading(true);

    try {
      const result =
        await sendMessage({
          question:
            cleanQuestion,

          userId:
            USER_ID,

          sessionId,
        });

      if (result.session_id) {
        setSessionId(
          result.session_id
        );

        localStorage.setItem(
          "agent_session_id",
          result.session_id
        );
      }

      const assistantMessageId =
        createId();

      const assistantMessage = {
        id:
          assistantMessageId,

        role:
          "assistant",

        text:
          result.answer,

        agent:
          result.agent,

        audioUrl:
          "",

        /*
         * Audio generation begins immediately
         * after the text appears.
         */
        audioStatus:
          "loading",

        audioError:
          "",
      };

      setMessages(
        (currentMessages) => [
          ...currentMessages,
          assistantMessage,
        ]
      );

      setBackendStatus(
        "connected"
      );

      /*
       * Do not await this call.
       *
       * The response text remains visible while
       * TTS is generated in the background.
       */
      void prepareMessageAudio({
        messageId:
          assistantMessageId,

        text:
          result.answer,

        shouldAutoPlay:
          autoSpeak,
      });
    } catch (requestError) {
      setBackendStatus(
        "disconnected"
      );

      setError(
        requestError.message
      );
    } finally {
      setIsLoading(false);
    }
  }


  function handleKeyDown(
    event
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      if (
        question.trim() &&
        !isLoading &&
        !isRecording &&
        !isTranscribing
      ) {
        event.currentTarget
          .form
          .requestSubmit();
      }
    }
  }


  function handleLanguageChange(
    event
  ) {
    const newLanguage =
      event.target.value;

    /*
     * Existing cached audio was generated
     * using the previous language.
     */
    audioGenerationVersionRef.current +=
      1;

    cleanupGeneratedAudio();

    setLanguageCode(
      newLanguage
    );

    setMessages(
      (currentMessages) =>
        currentMessages.map(
          (message) => {
            if (
              message.role !==
              "assistant"
            ) {
              return message;
            }

            return {
              ...message,
              audioUrl: "",
              audioStatus: "idle",
              audioError: "",
            };
          }
        )
    );
  }


  function startNewChat() {
    localStorage.removeItem(
      "agent_session_id"
    );

    if (isRecording) {
      stopRecording();
    }

    /*
     * Invalidates any background TTS
     * requests from the old chat.
     */
    audioGenerationVersionRef.current +=
      1;

    cleanupGeneratedAudio();

    setSessionId("");
    setQuestion("");
    setError("");

    setMessages([
      createAssistantMessage(
        "New voice conversation started. How can I help?"
      ),
    ]);
  }


  const microphoneLabel = (() => {
    if (isTranscribing) {
      return "Transcribing...";
    }

    if (isRecording) {
      return "■ Stop";
    }

    return "🎤 Record";
  })();


  return (
    <main className="page">
      <section className="chat-container">
        <header className="chat-header">
          <div>
            <p className="eyebrow">
              Chirp 3 + Gemini TTS
            </p>

            <h1>
              Multi-Agent Voice AI
            </h1>

            <p className="subtitle">
              Master Agent, RAG, web search,
              cloud STT and cloud TTS.
            </p>
          </div>

          <div className="header-actions">
            <span
              className={
                `status ${backendStatus}`
              }
            >
              {backendStatus ===
                "checking" &&
                "Checking backend"}

              {backendStatus ===
                "connected" &&
                "Backend connected"}

              {backendStatus ===
                "disconnected" &&
                "Backend disconnected"}
            </span>

            <button
              type="button"
              className="new-chat-button"
              onClick={startNewChat}
            >
              New chat
            </button>
          </div>
        </header>


        <div className="voice-settings">
          <label>
            Voice language

            <select
              value={languageCode}
              onChange={
                handleLanguageChange
              }
              disabled={
                isRecording ||
                isTranscribing ||
                isSpeaking
              }
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


          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(event) =>
                setAutoSpeak(
                  event.target.checked
                )
              }
            />

            Automatically speak answers
          </label>


          {isSpeaking && (
            <button
              type="button"
              className="stop-speaking-button"
              onClick={stopSpeaking}
            >
              Stop audio
            </button>
          )}
        </div>


        {!microphoneSupported && (
          <div className="speech-warning">
            Microphone recording is not
            supported in this browser.
          </div>
        )}


        <section className="messages">
          {messages.map(
            (message) => (
              <article
                key={message.id}
                className={
                  `message-row ${message.role}`
                }
              >
                <div className="message-bubble">
                  <span className="message-label">
                    {message.role ===
                    "user"
                      ? "You"
                      : "Assistant"}
                  </span>

                  <p>
                    {message.text}
                  </p>

                  {message.agent && (
                    <small className="agent-label">
                      Response:{" "}
                      {message.agent}
                    </small>
                  )}


                  {message.role ===
                    "assistant" && (
                    <div className="message-audio">
                      <button
                        type="button"
                        className="speak-button"
                        disabled={
                          message.audioStatus ===
                          "loading"
                        }
                        onClick={() => {
                          if (
                            message.audioStatus ===
                              "ready" &&
                            message.audioUrl
                          ) {
                            void playPreparedAudio(
                              message.audioUrl
                            );

                            return;
                          }

                          void prepareMessageAudio({
                            messageId:
                              message.id,

                            text:
                              message.text,

                            shouldAutoPlay:
                              true,
                          });
                        }}
                      >
                        {message.audioStatus ===
                          "loading" &&
                          "⏳ Preparing audio..."}

                        {message.audioStatus ===
                          "ready" &&
                          "🔊 Speak"}

                        {message.audioStatus ===
                          "error" &&
                          "↻ Retry audio"}

                        {(!message.audioStatus ||
                          message.audioStatus ===
                            "idle") &&
                          "🔊 Generate audio"}
                      </button>


                      {message.audioStatus ===
                        "ready" && (
                        <span className="audio-ready">
                          Audio ready
                        </span>
                      )}


                      {message.audioError && (
                        <small className="audio-error">
                          {message.audioError}
                        </small>
                      )}
                    </div>
                  )}
                </div>
              </article>
            )
          )}


          {isLoading && (
            <article className="message-row assistant">
              <div className="message-bubble loading-bubble">
                <span className="message-label">
                  Assistant
                </span>

                <div className="typing-row">
                  <span />
                  <span />
                  <span />

                  <p>
                    Selecting the appropriate
                    agent...
                  </p>
                </div>
              </div>
            </article>
          )}


          {isTranscribing && (
            <article className="message-row assistant">
              <div className="message-bubble loading-bubble">
                <span className="message-label">
                  Chirp 3
                </span>

                <div className="typing-row">
                  <span />
                  <span />
                  <span />

                  <p>
                    Transcribing your recording...
                  </p>
                </div>
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </section>


        {error && (
          <div className="error-box">
            <strong>Error:</strong>{" "}
            {error}
          </div>
        )}


        <form
          className="chat-form"
          onSubmit={handleSubmit}
        >
          <div className="question-area">
            <textarea
              value={question}
              onChange={(event) =>
                setQuestion(
                  event.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              placeholder={
                isRecording
                  ? "Recording... Speak clearly, then press Stop."
                  : isTranscribing
                    ? "Converting speech to text..."
                    : "Type a question or record your voice..."
              }
              rows={3}
              disabled={
                isLoading ||
                isTranscribing
              }
            />

            <button
              type="button"
              className={
                isRecording
                  ? "microphone-button listening"
                  : "microphone-button"
              }
              onClick={
                isRecording
                  ? stopRecording
                  : startRecording
              }
              disabled={
                !microphoneSupported ||
                isLoading ||
                isTranscribing
              }
            >
              {microphoneLabel}
            </button>
          </div>


          <button
            type="submit"
            className="send-button"
            disabled={
              !question.trim() ||
              isLoading ||
              isRecording ||
              isTranscribing
            }
          >
            {isLoading
              ? "Sending..."
              : "Send"}
          </button>
        </form>
      </section>
    </main>
  );
}


export default App;