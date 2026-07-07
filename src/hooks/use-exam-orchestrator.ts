import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { router } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { AudioManager } from "react-native-audio-api";
import { PART2_PREP_SECONDS, PART2_TALK_SECONDS } from "@/src/lib/config";
import {
  examReducer, initialExamState, phaseTimeoutSeconds, recordingPartFor,
  type ExamEvent, type ExamPhase,
} from "@/src/lib/exam/machine";
import type { ExamDisplayData, ReportPayload, SimMode, TokenResponse } from "@/src/lib/types";
import { PartAccumulator } from "@/src/lib/audio/part-accumulator";
import {
  configureExamAudioSession, deactivateAudioSession, requestMicPermission,
} from "@/src/lib/audio/session";
import { apiFetch } from "@/src/lib/api";
import { reportError, track } from "@/src/lib/telemetry";
import { useLiveSession, type LiveStatus } from "./use-live-session";
import { useMicStream } from "./use-mic-stream";

export type Screen = "preflight" | "exam" | "uploading" | "upload_failed" | "fatal";

export function useExamOrchestrator(mode: SimMode): {
  screen: Screen;
  phase: ExamPhase;
  banner: string;
  countdown: number | null;
  display: ExamDisplayData | null;
  liveStatus: LiveStatus;
  micLevel: number;
  examinerSpeaking: boolean;
  begin(): Promise<void>;
  endEarly(): void;
  retryUpload(): Promise<void>;
  sessionId: string | null;
} {
  const [screen, setScreen] = useState<Screen>("preflight");
  const [state, dispatch] = useReducer(examReducer, mode, initialExamState);
  const [session, setSession] = useState<TokenResponse | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [banner, setBanner] = useState("");

  // Lazy init — a `new PartAccumulator(...)` argument to useRef would
  // otherwise be constructed (and discarded) on every render.
  const accumulatorRef = useRef<PartAccumulator | null>(null);
  function getAccumulator(): PartAccumulator {
    if (!accumulatorRef.current) accumulatorRef.current = new PartAccumulator(16000);
    return accumulatorRef.current;
  }
  const currentPartRef = useRef<1 | 2 | 3 | null>(null);
  const resumeHandleRef = useRef<string | undefined>(undefined);
  const reconnectsRef = useRef(0);
  const endedRef = useRef(false);
  const micRunningRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Native interruption subscription lives for the duration of begin()..unmount;
  // interruptionHandlerRef always points at the latest closure (see below) so
  // the once-registered native callback never runs stale session/state values.
  const interruptionSubRef = useRef<{ remove(): void } | undefined>(undefined);

  const micStream = useMicStream();
  const onMicError = useCallback((message: string) => {
    setBanner(`Microphone error: ${message}`);
  }, []);

  const live = useLiveSession({
    onToolCall(name, args) {
      if (name === "advance_part") {
        const part = Number(args.part);
        if (part === 1 || part === 3) {
          dispatch({ type: "TOOL_CALL", name: "advance_part", toPart: part });
        }
      } else if (name === "start_part2_prep") {
        dispatch({ type: "TOOL_CALL", name: "start_part2_prep" });
      } else if (name === "end_exam") {
        dispatch({ type: "TOOL_CALL", name: "end_exam" });
      }
    },
    onResumptionHandle(handle) {
      resumeHandleRef.current = handle;
    },
    onUnexpectedClose() {
      if (endedRef.current || stateRef.current.phase === "ended") return;
      void attemptResume();
    },
    onError(message) {
      setBanner(`Connection problem: ${message}`);
    },
  });

  // Keep latest live-callbacks accessible to effects without re-running them.
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });

  // The native interruption listener is registered once (in begin()) but
  // must always run against the latest session/state — route it through a
  // ref updated every render, same pattern as liveRef above.
  const interruptionHandlerRef = useRef<
    (event: { type: "began" | "ended"; shouldResume: boolean }) => void | Promise<void>
  >(() => {});
  useEffect(() => {
    interruptionHandlerRef.current = handleAudioInterruption;
  });

  // Mic chunks feed the live session; they only accumulate into the
  // scoring recording while currentPartRef names an active part (set by the
  // phase effect below) — this replaces the web's MediaRecorder start/stop.
  // Half-duplex gate: while examiner audio is playing, the mic neither
  // streams nor records — speaker-mode echo can't loop back into the model
  // (spurious interruptions) or contaminate the scored WAV.
  const onChunk = useCallback((pcm: Int16Array) => {
    if (liveRef.current.isExaminerSpeaking()) return;
    // Coarse RMS (every 8th sample) drives the on-screen mic meter.
    let sum = 0;
    for (let i = 0; i < pcm.length; i += 8) {
      const v = pcm[i] / 0x8000;
      sum += v * v;
    }
    micLevelRef.current = Math.min(1, Math.sqrt(sum / (pcm.length / 8)) * 4);
    liveRef.current.sendAudioChunk(pcm);
    if (currentPartRef.current) getAccumulator().add(currentPartRef.current, pcm);
  }, []);

  // Publish voice state (mic level + examiner-speaking) at UI cadence —
  // refs absorb the 10 Hz audio callbacks; renders happen ~5x/s.
  const micLevelRef = useRef(0);
  const [voice, setVoice] = useState({ micLevel: 0, examinerSpeaking: false });
  useEffect(() => {
    if (screen !== "exam") return;
    const interval = setInterval(() => {
      setVoice({
        micLevel: micLevelRef.current,
        examinerSpeaking: liveRef.current.isExaminerSpeaking(),
      });
      micLevelRef.current *= 0.55; // decay so the meter falls in silence
    }, 180);
    return () => clearInterval(interval);
  }, [screen]);

  // Unmount safety net: nothing should stay hot (open connection, running
  // mic, active audio session, interruption subscription) after the hook is
  // torn down.
  useEffect(() => {
    return () => {
      micStream.stop();
      micRunningRef.current = false;
      liveRef.current.disconnect();
      void deactivateAudioSession();
      interruptionSubRef.current?.remove();
      interruptionSubRef.current = undefined;
      AudioManager.observeAudioInterruptions(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = useCallback(async () => {
    const granted = await requestMicPermission();
    if (!granted) {
      setBanner("Microphone access is required to start the exam.");
      setScreen("fatal");
      return;
    }
    try {
      await configureExamAudioSession();
      setScreen("exam");
      const res = await apiFetch("/api/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json()) as TokenResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      track("exam_started", { mode });
      // Bail if the exam was force-ended while the token fetch was in flight
      // — otherwise a hot mic/session resurrects behind the fatal/ended screen.
      if (endedRef.current) {
        liveRef.current.disconnect();
        micStream.stop();
        void deactivateAudioSession();
        return;
      }
      setSession(body);
      await live.connect({ token: body.token, model: body.model });
      if (endedRef.current) {
        liveRef.current.disconnect();
        micStream.stop();
        void deactivateAudioSession();
        return;
      }
      await micStream.start(onChunk, onMicError);
      if (endedRef.current) {
        liveRef.current.disconnect();
        micStream.stop();
        void deactivateAudioSession();
        return;
      }
      micRunningRef.current = true;
      // Re-assert the exam session config now that every audio unit exists
      // (recorder started, playback context primed by connect) — creating
      // either can silently reset the session mode, losing voiceChat AEC.
      await configureExamAudioSession();
      AudioManager.observeAudioInterruptions(true);
      interruptionSubRef.current = AudioManager.addSystemEventListener("interruption", (event) =>
        void interruptionHandlerRef.current(event)
      );
      dispatch({ type: "CONNECTED" });
    } catch (err) {
      liveRef.current.disconnect();
      micStream.stop();
      await deactivateAudioSession();
      setBanner(err instanceof Error ? err.message : "Could not start the exam.");
      setScreen("fatal");
    }
  }, [live, mode, micStream, onChunk, onMicError]);

  async function attemptResume() {
    if (reconnectsRef.current >= 2 || !session || !micRunningRef.current) {
      await abortSession();
      return;
    }
    reconnectsRef.current += 1;
    setBanner("Connection lost — reconnecting…");
    try {
      const res = await apiFetch("/api/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: session.sessionId }),
      });
      const body = (await res.json()) as TokenResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "resume refused");
      await liveRef.current.connect({
        token: body.token, model: body.model, resumeHandle: resumeHandleRef.current,
      });
      setBanner("");
      liveRef.current.setExaminerMuted(stateRef.current.phase === "part2_talk");
    } catch {
      await abortSession();
    }
  }

  // I2: iOS audio interruptions (phone calls, Siri, other apps grabbing the
  // session). On "began" we just stop the local mic pipeline and wait — the
  // live socket is left alone. On "ended" the simplest deterministic path is
  // to always disconnect first, then attemptResume(): if the socket actually
  // survived, this just costs one reconnect; it never risks a double-connect.
  async function handleAudioInterruption(event: { type: "began" | "ended"; shouldResume: boolean }) {
    if (endedRef.current) return;
    if (event.type === "began") {
      micStream.stop();
      micRunningRef.current = false;
      setBanner("Audio interrupted — reconnecting when finished…");
      return;
    }
    liveRef.current.disconnect();
    await configureExamAudioSession();
    await micStream.start(onChunk, onMicError);
    micRunningRef.current = true;
    void attemptResume();
  }

  async function abortSession() {
    if (!session) return setScreen("fatal");
    // Recordings on hand are synchronous (no stop/wait dance needed — the
    // accumulator already holds whatever chunks landed while a part was
    // active). Partial scoring is still worth more than a refund.
    if (getAccumulator().parts().length > 0) {
      dispatch({ type: "FORCE_END" });
      return;
    }
    // No usable audio — stop the mic and release the audio session before
    // going fatal.
    micStream.stop();
    micRunningRef.current = false;
    await deactivateAudioSession();
    const res = await apiFetch(`/api/sessions/${session.sessionId}/abort`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { refunded?: boolean };
    setBanner(
      body.refunded
        ? "The session could not continue. Your quota was refunded."
        : "The session could not continue."
    );
    setScreen("fatal");
  }

  // Uploads whatever the accumulator currently holds. Extracted so "Retry
  // upload" can re-invoke it without repeating finishAndScore's teardown.
  // The WAVs go DIRECTLY to Supabase Storage via signed URLs — Vercel caps
  // request bodies at ~4.5 MB, far below a multi-minute uncompressed WAV,
  // so audio bytes must never transit the backend. /api/score then gets a
  // tiny JSON registration instead of multipart.
  async function uploadRecordings() {
    if (!session) return setScreen("fatal");
    const parts = getAccumulator().parts();
    const cacheFiles: File[] = [];
    try {
      const urlRes = await apiFetch(`/api/sessions/${session.sessionId}/upload-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: parts.map((part) => ({ part })) }),
      });
      if (!urlRes.ok) throw new Error(`upload-urls HTTP ${urlRes.status}`);
      const { uploads } = (await urlRes.json()) as {
        uploads: { part: 1 | 2 | 3; signedUrl: string }[];
      };

      for (const part of parts) {
        const target = uploads.find((u) => u.part === part);
        if (!target) throw new Error(`no upload URL for part ${part}`);
        const file = new File(Paths.cache, `part${part}.wav`);
        file.write(getAccumulator().toWav(part));
        cacheFiles.push(file);
        // Native uploader: no RN fetch/Blob limitations, streams from disk.
        const put = await LegacyFileSystem.uploadAsync(target.signedUrl, file.uri, {
          httpMethod: "PUT",
          uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { "Content-Type": "audio/wav" },
        });
        if (put.status < 200 || put.status >= 300) {
          throw new Error(`part ${part} upload HTTP ${put.status}`);
        }
      }

      const res = await apiFetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          uploadedParts: parts.map((part) => ({
            part,
            duration: Math.round(getAccumulator().durationSeconds(part)),
          })),
        }),
      });
      // 503 means scoring is temporarily down but the audio was already
      // persisted server-side; 409 means the server had already scored this
      // session (e.g. our fetch timed out but the upload/score actually
      // finished) — both land on the report screen, which handles the rest.
      if (res.ok || res.status === 503 || res.status === 409) {
        track("exam_completed", { mode, parts: parts.length });
        router.replace(`/report/${session.sessionId}`);
        return;
      }
      track("upload_failed", { mode, status: res.status });
      reportError(new Error(`score registration HTTP ${res.status}`), { mode });
      setBanner("Upload failed. Your recordings are kept on this page — try again.");
      setScreen("upload_failed");
    } catch {
      // Network error or timeout — best-effort probe: if the server actually
      // finished (scored/completed) despite our fetch failing, go straight to
      // the report instead of telling the user their upload failed.
      const probe = await apiFetch(`/api/sessions/${session.sessionId}/report`, { method: "GET" })
        .then((r) => (r.ok ? (r.json() as Promise<ReportPayload>) : null))
        .catch(() => null);
      if (probe && (probe.status === "scored" || probe.status === "completed")) {
        track("exam_completed", { mode, parts: parts.length, recovered: true });
        router.replace(`/report/${session.sessionId}`);
        return;
      }
      track("upload_failed", { mode, status: "network" });
      setBanner("Upload failed — check your connection and try again.");
      setScreen("upload_failed");
    } finally {
      // Best-effort cleanup — a leftover cache file isn't worth surfacing.
      for (const file of cacheFiles) {
        try {
          file.delete();
        } catch {
          // ignore
        }
      }
    }
  }

  async function finishAndScore() {
    setScreen("uploading");
    liveRef.current.disconnect();
    micStream.stop();
    micRunningRef.current = false;
    await deactivateAudioSession();

    if (!session) return setScreen("fatal");
    if (getAccumulator().parts().length === 0) {
      // Nothing to score — refund the same way any other abort would.
      const res = await apiFetch(`/api/sessions/${session.sessionId}/abort`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { refunded?: boolean };
      setBanner(
        body.refunded
          ? "No audio was recorded, so there is nothing to score. Your quota was refunded."
          : "No audio was recorded, so there is nothing to score."
      );
      return setScreen("fatal");
    }
    await uploadRecordings();
  }

  const endEarly = useCallback(() => {
    dispatch({ type: "FORCE_END" });
  }, []);

  // --- Phase-driven side effects ---
  useEffect(() => {
    if (screen !== "exam") return;
    const { phase } = state;

    // Recording follows the phase
    currentPartRef.current = recordingPartFor(phase);

    // Examiner audio is suppressed during the monologue
    liveRef.current.setExaminerMuted(phase === "part2_talk");

    // Prep + talk countdowns with [SYSTEM] handoff messages
    let interval: ReturnType<typeof setInterval> | undefined;
    if (phase === "part2_prep" || phase === "part2_talk") {
      const total = phase === "part2_prep" ? PART2_PREP_SECONDS : PART2_TALK_SECONDS;
      const done: ExamEvent =
        phase === "part2_prep" ? { type: "PREP_TIMER_DONE" } : { type: "TALK_TIMER_DONE" };
      const systemMsg =
        phase === "part2_prep"
          ? "[SYSTEM] The one-minute preparation time is over. Invite the candidate to begin their talk now."
          : state.mode === "full"
            ? "[SYSTEM] The candidate's two minutes are up. Stop them politely, ask exactly one rounding-off question, and after their answer call advance_part with part=3."
            : "[SYSTEM] The candidate's two minutes are up. Stop them politely, ask exactly one rounding-off question, then close and call end_exam.";
      let left = total;
      setCountdown(left);
      interval = setInterval(() => {
        left -= 1;
        setCountdown(left);
        if (left <= 0) {
          clearInterval(interval);
          setCountdown(null);
          liveRef.current.sendSystemText(systemMsg);
          dispatch(done);
        }
      }, 1000);
    } else {
      setCountdown(null);
    }

    // Hard backstop per phase
    const timeoutS = phaseTimeoutSeconds(phase, state.mode);
    const backstop = timeoutS
      ? setTimeout(() => {
          liveRef.current.sendSystemText(
            "[SYSTEM] Time for this section is over. Move on immediately as scripted."
          );
          dispatch({ type: "PHASE_TIMEOUT" });
        }, timeoutS * 1000)
      : undefined;

    if (phase === "ended" && !endedRef.current) {
      endedRef.current = true;
      void finishAndScore();
    }

    return () => {
      if (interval) clearInterval(interval);
      if (backstop) clearTimeout(backstop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, screen]);

  return {
    screen,
    phase: state.phase,
    banner,
    countdown,
    display: session?.display ?? null,
    liveStatus: live.status,
    micLevel: voice.micLevel,
    examinerSpeaking: voice.examinerSpeaking,
    begin,
    endEarly,
    retryUpload: uploadRecordings,
    sessionId: session?.sessionId ?? null,
  };
}
