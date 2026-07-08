import { useCallback, useEffect, useRef, useState } from "react";
// "@google/genai/web": Metro resolves the bare package to a cross-platform
// stub whose Live API throws on React Native; the web build (WebSocket,
// fetch, atob — all present in Hermes) is the supported client path.
import { EndSensitivity, GoogleGenAI, Modality, type Session } from "@google/genai/web";
import { int16ToBase64 } from "@/src/lib/audio/pcm";
import { logCrumb } from "@/src/lib/debug-log";
import { Pcm24kPlayer } from "@/src/lib/audio/player";

export type LiveStatus = "idle" | "connecting" | "live" | "closed" | "error";

export interface LiveHandlers {
  onToolCall(name: string, args: Record<string, unknown>): void;
  onResumptionHandle(handle: string): void;
  onUnexpectedClose(): void;
  onError(message: string): void;
  /** Streaming ASR fragments for both sides of the conversation. */
  onTranscript(role: "examiner" | "candidate", text: string): void;
}

export interface ConnectOpts {
  token: string;
  model: string;
  resumeHandle?: string;
  /** Prebuilt Gemini voice for the examiner persona (e.g. "Aoede"). */
  voiceName?: string;
}

export function useLiveSession(handlers: LiveHandlers) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const sessionRef = useRef<Session | null>(null);
  const playerRef = useRef<Pcm24kPlayer | null>(null);
  const intentionalCloseRef = useRef(false);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // Bumped on every connect()/disconnect() so stale async work (a pending
  // ai.live.connect(), a superseded session's callbacks) can recognize it's
  // no longer current and become a no-op.
  const genRef = useRef(0);

  const teardown = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    void playerRef.current?.close();
    playerRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    genRef.current++;
    intentionalCloseRef.current = true;
    teardown();
    setStatus("closed");
  }, [teardown]);

  const connect = useCallback(async (opts: ConnectOpts) => {
    genRef.current++;
    const gen = genRef.current;
    intentionalCloseRef.current = true;
    teardown();
    intentionalCloseRef.current = false;

    try {
      setStatus("connecting");

      const player = new Pcm24kPlayer();
      playerRef.current = player;

      // Ephemeral token IS the api key; tokens are a v1alpha feature.
      const ai = new GoogleGenAI({
        apiKey: opts.token,
        httpOptions: { apiVersion: "v1alpha" },
      });

      const session = await ai.live.connect({
        model: opts.model,
        callbacks: {
          onopen: () => {
            if (genRef.current !== gen) return;
            setStatus("live");
          },
          onmessage: (message) => {
            if (genRef.current !== gen) return;

            // Model audio out (24 kHz PCM16 base64)
            if (message.data) player.enqueue(message.data);

            const sc = message.serverContent;
            if (sc?.interrupted) player.stop();
            if (sc?.outputTranscription?.text) {
              handlersRef.current.onTranscript("examiner", sc.outputTranscription.text);
            }
            if (sc?.inputTranscription?.text) {
              handlersRef.current.onTranscript("candidate", sc.inputTranscription.text);
            }

            if (message.toolCall?.functionCalls) {
              const responses = message.toolCall.functionCalls.map((fc) => {
                handlersRef.current.onToolCall(
                  fc.name ?? "", (fc.args ?? {}) as Record<string, unknown>
                );
                return { id: fc.id, name: fc.name, response: { result: "ok" } };
              });
              sessionRef.current?.sendToolResponse({ functionResponses: responses });
            }

            const update = message.sessionResumptionUpdate;
            if (update?.resumable && update.newHandle) {
              handlersRef.current.onResumptionHandle(update.newHandle);
            }
            // goAway means the server will drop us soon; treat as a reconnect
            // signal — exam-room resumes with the stored handle.
            if (message.goAway) handlersRef.current.onUnexpectedClose();
          },
          onerror: (e: ErrorEvent) => {
            logCrumb("live_error", { message: e.message ?? "" });
            if (genRef.current !== gen) return;
            setStatus("error");
            handlersRef.current.onError(e.message ?? "Live connection error");
          },
          onclose: () => {
            logCrumb("live_close", { intentional: intentionalCloseRef.current });
            if (genRef.current !== gen) return;
            setStatus("closed");
            if (!intentionalCloseRef.current) handlersRef.current.onUnexpectedClose();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          contextWindowCompression: { slidingWindow: {} }, // removes 15-min cap
          sessionResumption: { handle: opts.resumeHandle ?? undefined },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          ...(opts.voiceName
            ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voiceName } } } }
            : {}),
          // IELTS answers contain natural thinking pauses — the default VAD
          // declares end-of-turn too eagerly and the examiner cuts in
          // mid-answer. Low sensitivity + a longer silence window lets the
          // candidate breathe without losing the floor.
          realtimeInputConfig: {
            automaticActivityDetection: {
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              silenceDurationMs: 2000,
            },
          },
        },
      });

      if (genRef.current !== gen) {
        session.close();
        return;
      }
      sessionRef.current = session;
      // Eager context creation — the exam audio session config asserted
      // after connect must govern playback (voiceChat/AEC), not be reset
      // by a lazily-created context on the first examiner chunk.
      player.prime();
    } catch (err) {
      if (genRef.current === gen) {
        teardown();
        setStatus("error");
      }
      throw err;
    }
  }, [teardown]);

  const sendSystemText = useCallback((text: string) => {
    try {
      sessionRef.current?.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      });
    } catch (err) {
      console.warn("sendSystemText failed:", err);
    }
  }, []);

  const sendAudioChunk = useCallback((pcm: Int16Array) => {
    try {
      sessionRef.current?.sendRealtimeInput({
        audio: { data: int16ToBase64(pcm), mimeType: "audio/pcm;rate=16000" },
      });
    } catch (err) {
      console.warn("sendAudioChunk failed:", err);
    }
  }, []);

  const setExaminerMuted = useCallback((muted: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    player.muted = muted;
    // Deliberately no stop(): audio already queued (the "please begin your
    // talk" invite) plays out; muting only drops chunks arriving afterwards.
  }, []);

  /** Half-duplex gate: true while examiner audio is playing. The mic is
   *  not sent (or recorded) during this window, making speaker-mode echo
   *  feedback structurally impossible regardless of AEC quality. */
  const isExaminerSpeaking = useCallback((): boolean => {
    return playerRef.current?.isPlaying ?? false;
  }, []);

  return {
    status, connect, disconnect, sendSystemText, sendAudioChunk,
    setExaminerMuted, isExaminerSpeaking,
  };
}
