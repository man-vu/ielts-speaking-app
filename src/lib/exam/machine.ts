import type { SimMode } from "../types";

export type ExamPhase =
  | "connecting" | "intro" | "part1" | "part2_prep" | "part2_talk"
  | "part2_rounding" | "part3" | "ended";

export type ExamEvent =
  | { type: "CONNECTED" }
  | { type: "TOOL_CALL"; name: "advance_part"; toPart: 1 | 2 | 3 }
  | { type: "TOOL_CALL"; name: "start_part2_prep" }
  | { type: "TOOL_CALL"; name: "end_exam" }
  | { type: "PREP_TIMER_DONE" }
  | { type: "TALK_TIMER_DONE" }
  | { type: "PHASE_TIMEOUT" }
  | { type: "FORCE_END" };

export interface ExamState {
  mode: SimMode;
  phase: ExamPhase;
}

export function initialExamState(mode: SimMode): ExamState {
  return { mode, phase: "connecting" };
}

export function recordingPartFor(phase: ExamPhase): 1 | 2 | 3 | null {
  if (phase === "part1") return 1;
  if (phase === "part2_talk" || phase === "part2_rounding") return 2;
  if (phase === "part3") return 3;
  return null;
}

/** Hard backstop per phase — fires PHASE_TIMEOUT if the model stalls. */
export function phaseTimeoutSeconds(phase: ExamPhase, mode: SimMode): number | null {
  switch (phase) {
    case "connecting": return 30;
    case "intro": return 90;
    case "part1": return mode === "part1" ? 420 : mode === "chat" ? 900 : 330;
    case "part2_prep": return 90;   // PREP_TIMER_DONE fires at 60; this is the backstop
    case "part2_talk": return 150;  // TALK_TIMER_DONE fires at 120
    case "part2_rounding": return 75;
    case "part3": return mode === "part3" ? 420 : 330;
    case "ended": return null;
  }
}

/** After a phase's backstop fires, where do we force the exam? */
function timeoutTarget(state: ExamState): ExamPhase {
  const { mode, phase } = state;
  if (phase === "connecting") return "ended";
  if (phase === "intro") {
    if (mode === "part2") return "part2_prep";
    if (mode === "part3") return "part3";
    return "part1";
  }
  if (phase === "part1") return mode === "full" ? "part2_prep" : "ended";
  if (phase === "part2_prep") return "part2_talk";
  if (phase === "part2_talk") return "part2_rounding";
  if (phase === "part2_rounding") return mode === "full" ? "part3" : "ended";
  return "ended"; // part3, ended
}

export function examReducer(state: ExamState, event: ExamEvent): ExamState {
  const { mode, phase } = state;
  const to = (next: ExamPhase): ExamState => ({ ...state, phase: next });

  switch (event.type) {
    case "FORCE_END":
      return to("ended");

    case "CONNECTED":
      return phase === "connecting" ? to("intro") : state;

    case "PHASE_TIMEOUT":
      return phase === "ended" ? state : to(timeoutTarget(state));

    case "PREP_TIMER_DONE":
      return phase === "part2_prep" ? to("part2_talk") : state;

    case "TALK_TIMER_DONE":
      return phase === "part2_talk" ? to("part2_rounding") : state;

    case "TOOL_CALL":
      switch (event.name) {
        case "advance_part":
          if (
            event.toPart === 1 && phase === "intro" &&
            (mode === "full" || mode === "part1" || mode === "chat")
          ) {
            return to("part1");
          }
          if (
            event.toPart === 3 &&
            ((phase === "intro" && mode === "part3") ||
              // NOT from part2_talk: the live model treats any thinking pause
              // as "talk finished" and tries to advance — the candidate's two
              // minutes belong to the timer, not the model's turn-taking.
              (mode === "full" && phase === "part2_rounding"))
          ) {
            return to("part3");
          }
          return state;
        case "start_part2_prep":
          if (
            (phase === "part1" && mode === "full") ||
            (phase === "intro" && mode === "part2")
          ) {
            return to("part2_prep");
          }
          return state;
        case "end_exam":
          // Legal only from a terminal-eligible phase for the mode. Never
          // from part2_talk: a model that mistakes a pause for the end of
          // the talk must not be able to send the exam to marking (observed
          // on device: 14 s into a 2-minute talk).
          if (phase === "part3") return to("ended");
          if ((mode === "part1" || mode === "chat") && phase === "part1") return to("ended");
          if (mode === "part2" && phase === "part2_rounding") return to("ended");
          return state;
      }
  }
}
