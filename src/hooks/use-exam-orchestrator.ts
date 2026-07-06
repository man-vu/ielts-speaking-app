import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { router } from "expo-router";
import { File, Paths } from "expo-file-system";
import { PART2_PREP_SECONDS, PART2_TALK_SECONDS } from "@/src/lib/config";
import {
  examReducer, initialExamState, phaseTimeoutSeconds, recordingPartFor,
  type ExamEvent, type ExamPhase,
} from "@/src/lib/exam/machine";
import type { ExamDisplayData, SimMode, TokenResponse } from "@/src/lib/types";
import { PartAccumulator } from "@/src/lib/audio/part-accumulator";
import {
  configureExamAudioSession, deactivateAudioSession, requestMicPermission,
} from "@/src/lib/audio/session";
import { apiFetch } from "@/src/lib/api";
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

  const accumulatorRef = useRef(new PartAccumulator(16000));
  const currentPartRef = useRef<1 | 2 | 3 | null>(null);
  const resumeHandleRef = useRef<string | undefined>(undefined);
  const reconnectsRef = useRef(0);
  const endedRef = useRef(false);
  const micRunningRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const micStream = useMicStream();

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

  // Mic chunks always feed the live session; they only accumulate into the
  // scoring recording while currentPartRef names an active part (set by the
  // phase effect below) — this replaces the web's MediaRecorder start/stop.
  const onChunk = useCallback((pcm: Int16Array) => {
    liveRef.current.sendAudioChunk(pcm);
    if (currentPartRef.current) accumulatorRef.current.add(currentPartRef.current, pcm);
  }, []);

  // Unmount safety net: nothing should stay hot (open connection, running
  // mic, active audio session) after the hook is torn down.
  useEffect(() => {
    return () => {
      micStream.stop();
      micRunningRef.current = false;
      liveRef.current.disconnect();
      void deactivateAudioSession();
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
      setSession(body);
      await live.connect({ token: body.token, model: body.model });
      await micStream.start(onChunk);
      micRunningRef.current = true;
      dispatch({ type: "CONNECTED" });
    } catch (err) {
      liveRef.current.disconnect();
      micStream.stop();
      await deactivateAudioSession();
      setBanner(err instanceof Error ? err.message : "Could not start the exam.");
      setScreen("fatal");
    }
  }, [live, mode, micStream, onChunk]);

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

  async function abortSession() {
    if (!session) return setScreen("fatal");
    // Recordings on hand are synchronous (no stop/wait dance needed — the
    // accumulator already holds whatever chunks landed while a part was
    // active). Partial scoring is still worth more than a refund.
    if (accumulatorRef.current.parts().length > 0) {
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

  // Builds the FormData from whatever the accumulator currently holds and
  // uploads it. Extracted so "Retry upload" can re-invoke it without
  // repeating the one-time teardown in finishAndScore.
  async function uploadRecordings() {
    if (!session) return setScreen("fatal");
    const parts = accumulatorRef.current.parts();
    const fd = new FormData();
    fd.append("sessionId", session.sessionId);
    const cacheFiles: File[] = [];
    try {
      for (const part of parts) {
        // RN 0.86's Blob constructor throws on ArrayBuffer parts, so the WAV
        // goes to a cache file instead; FormData gets a file descriptor.
        const wavBytes = accumulatorRef.current.toWav(part);
        const file = new File(Paths.cache, `part${part}.wav`);
        file.write(wavBytes);
        cacheFiles.push(file);
        // RN's FormData accepts a { uri, name, type } file descriptor at
        // runtime; the DOM Blob type doesn't know about that shape, hence
        // the cast.
        fd.append(
          `part${part}`,
          { uri: file.uri, name: `part${part}.wav`, type: "audio/wav" } as unknown as Blob
        );
        fd.append(`duration${part}`, String(Math.round(accumulatorRef.current.durationSeconds(part))));
      }
      // Do NOT set Content-Type — fetch derives the multipart boundary from
      // the FormData body.
      const res = await apiFetch("/api/score", { method: "POST", body: fd });
      // 503 means scoring is temporarily down but the audio was already
      // persisted server-side — the report screen's retry handles that case.
      if (res.ok || res.status === 503) {
        router.replace(`/report/${session.sessionId}`);
        return;
      }
      setBanner("Upload failed. Your recordings are kept on this page — try again.");
      setScreen("upload_failed");
    } catch {
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
    if (accumulatorRef.current.parts().length === 0) {
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
    begin,
    endEarly,
    retryUpload: uploadRecordings,
    sessionId: session?.sessionId ?? null,
  };
}
