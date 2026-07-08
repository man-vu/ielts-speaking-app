import { describe, expect, it } from "vitest";
import {
  examReducer, initialExamState, phaseTimeoutSeconds, recordingPartFor,
  type ExamEvent, type ExamState,
} from "./machine";

function run(state: ExamState, events: ExamEvent[]): ExamState {
  return events.reduce(examReducer, state);
}

describe("full exam flow", () => {
  it("walks the happy path intro → part1 → part2 → part3 → ended", () => {
    let s = initialExamState("full");
    expect(s.phase).toBe("connecting");
    s = run(s, [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "TOOL_CALL", name: "start_part2_prep" },
      { type: "PREP_TIMER_DONE" },
      { type: "TALK_TIMER_DONE" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 3 },
      { type: "TOOL_CALL", name: "end_exam" },
    ]);
    expect(s.phase).toBe("ended");
  });

  it("protects the long turn: no tool call can leave part2_talk (timer only)", () => {
    // A live model that mistakes a thinking pause for the end of the talk
    // must not be able to advance or end the exam mid-talk.
    let s = run(initialExamState("full"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "TOOL_CALL", name: "start_part2_prep" },
      { type: "PREP_TIMER_DONE" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 3 },
      { type: "TOOL_CALL", name: "end_exam" },
    ]);
    expect(s.phase).toBe("part2_talk");
    s = run(s, [
      { type: "TALK_TIMER_DONE" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 3 },
    ]);
    expect(s.phase).toBe("part3");
  });

  it("ignores nonsense transitions (end_exam during prep keeps prep)", () => {
    let s = run(initialExamState("full"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "TOOL_CALL", name: "start_part2_prep" },
    ]);
    const before = s.phase;
    s = examReducer(s, { type: "TOOL_CALL", name: "end_exam" });
    expect(s.phase).toBe(before); // "part2_prep"
  });

  it("PHASE_TIMEOUT force-advances part1 → part2_prep in full mode", () => {
    let s = run(initialExamState("full"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "PHASE_TIMEOUT" },
    ]);
    expect(s.phase).toBe("part2_prep");
  });

  it("FORCE_END ends from any phase", () => {
    const s = examReducer(initialExamState("full"), { type: "FORCE_END" });
    expect(s.phase).toBe("ended");
  });
});

describe("practice modes", () => {
  it("part2 mode: intro → part2_prep via start_part2_prep, ends after rounding", () => {
    let s = run(initialExamState("part2"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "start_part2_prep" },
      { type: "PREP_TIMER_DONE" },
      { type: "TALK_TIMER_DONE" },
      { type: "TOOL_CALL", name: "end_exam" },
    ]);
    expect(s.phase).toBe("ended");
  });

  it("part1 mode: end_exam from part1 ends; PHASE_TIMEOUT also ends", () => {
    let s = run(initialExamState("part1"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
    ]);
    expect(examReducer(s, { type: "TOOL_CALL", name: "end_exam" }).phase).toBe("ended");
    expect(examReducer(s, { type: "PHASE_TIMEOUT" }).phase).toBe("ended");
  });

  it("part3 mode: advance_part 3 from intro", () => {
    const s = run(initialExamState("part3"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 3 },
    ]);
    expect(s.phase).toBe("part3");
  });
});

describe("recordingPartFor", () => {
  it("maps phases to the recorded part", () => {
    expect(recordingPartFor("part1")).toBe(1);
    expect(recordingPartFor("part2_talk")).toBe(2);
    expect(recordingPartFor("part2_rounding")).toBe(2);
    expect(recordingPartFor("part3")).toBe(3);
    expect(recordingPartFor("part2_prep")).toBe(null);
    expect(recordingPartFor("intro")).toBe(null);
    expect(recordingPartFor("ended")).toBe(null);
  });
});

describe("phaseTimeoutSeconds", () => {
  it("gives every active phase a backstop and none to ended", () => {
    expect(phaseTimeoutSeconds("part1", "full")).toBeGreaterThan(0);
    expect(phaseTimeoutSeconds("part2_talk", "full")).toBeGreaterThan(120);
    expect(phaseTimeoutSeconds("ended", "full")).toBe(null);
  });
});

describe("PHASE_TIMEOUT backstops", () => {
  it("connecting + PHASE_TIMEOUT → ended", () => {
    let s = initialExamState("full");
    expect(s.phase).toBe("connecting");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("ended");
  });

  it("intro + PHASE_TIMEOUT → part1 (mode full)", () => {
    let s = run(initialExamState("full"), [{ type: "CONNECTED" }]);
    expect(s.phase).toBe("intro");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("part1");
  });

  it("intro + PHASE_TIMEOUT → part2_prep (mode part2)", () => {
    let s = run(initialExamState("part2"), [{ type: "CONNECTED" }]);
    expect(s.phase).toBe("intro");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("part2_prep");
  });

  it("intro + PHASE_TIMEOUT → part3 (mode part3)", () => {
    let s = run(initialExamState("part3"), [{ type: "CONNECTED" }]);
    expect(s.phase).toBe("intro");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("part3");
  });

  it("part2_prep + PHASE_TIMEOUT → part2_talk (mode full)", () => {
    let s = run(initialExamState("full"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "TOOL_CALL", name: "start_part2_prep" },
    ]);
    expect(s.phase).toBe("part2_prep");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("part2_talk");
  });

  it("part2_talk + PHASE_TIMEOUT → part2_rounding (mode full)", () => {
    let s = run(initialExamState("full"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "TOOL_CALL", name: "start_part2_prep" },
      { type: "PREP_TIMER_DONE" },
    ]);
    expect(s.phase).toBe("part2_talk");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("part2_rounding");
  });

  it("part2_rounding + PHASE_TIMEOUT → part3 (mode full)", () => {
    let s = run(initialExamState("full"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "TOOL_CALL", name: "start_part2_prep" },
      { type: "PREP_TIMER_DONE" },
      { type: "TALK_TIMER_DONE" },
    ]);
    expect(s.phase).toBe("part2_rounding");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("part3");
  });

  it("part2_rounding + PHASE_TIMEOUT → ended (mode part2)", () => {
    let s = run(initialExamState("part2"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "start_part2_prep" },
      { type: "PREP_TIMER_DONE" },
      { type: "TALK_TIMER_DONE" },
    ]);
    expect(s.phase).toBe("part2_rounding");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("ended");
  });

  it("part3 + PHASE_TIMEOUT → ended (mode full)", () => {
    let s = run(initialExamState("full"), [
      { type: "CONNECTED" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 1 },
      { type: "TOOL_CALL", name: "start_part2_prep" },
      { type: "PREP_TIMER_DONE" },
      { type: "TALK_TIMER_DONE" },
      { type: "TOOL_CALL", name: "advance_part", toPart: 3 },
    ]);
    expect(s.phase).toBe("part3");
    s = examReducer(s, { type: "PHASE_TIMEOUT" });
    expect(s.phase).toBe("ended");
  });

  it("advance_part with toPart: 2 is ignored from intro (mode full)", () => {
    let s = run(initialExamState("full"), [{ type: "CONNECTED" }]);
    expect(s.phase).toBe("intro");
    const before = s.phase;
    s = examReducer(s, { type: "TOOL_CALL", name: "advance_part", toPart: 2 });
    expect(s.phase).toBe(before);
  });

  it("phaseTimeoutSeconds: connecting = 30", () => {
    expect(phaseTimeoutSeconds("connecting", "full")).toBe(30);
  });

  it("phaseTimeoutSeconds: intro = 90", () => {
    expect(phaseTimeoutSeconds("intro", "full")).toBe(90);
  });

  it("phaseTimeoutSeconds: part2_prep = 90", () => {
    expect(phaseTimeoutSeconds("part2_prep", "full")).toBe(90);
  });

  it("phaseTimeoutSeconds: part2_talk = 150", () => {
    expect(phaseTimeoutSeconds("part2_talk", "full")).toBe(150);
  });

  it("phaseTimeoutSeconds: part2_rounding = 75", () => {
    expect(phaseTimeoutSeconds("part2_rounding", "full")).toBe(75);
  });

  it("phaseTimeoutSeconds: part1 full = 330, part1 mode = 420", () => {
    expect(phaseTimeoutSeconds("part1", "full")).toBe(330);
    expect(phaseTimeoutSeconds("part1", "part1")).toBe(420);
  });

  it("phaseTimeoutSeconds: part3 full = 330, part3 mode = 420", () => {
    expect(phaseTimeoutSeconds("part3", "full")).toBe(330);
    expect(phaseTimeoutSeconds("part3", "part3")).toBe(420);
  });
});
