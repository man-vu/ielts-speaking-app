import { describe, expect, it } from "vitest";
import {
  classifyCriterion, segmentForPart, segmentTranscript, speechMetrics,
} from "./report-insights";

describe("classifyCriterion", () => {
  it("classifies the scorer's structured error types", () => {
    expect(classifyCriterion("GRAMMAR: VERB TENSE/MEANING")).toBe("grammatical_range_accuracy");
    expect(classifyCriterion("LEXICAL: WORD CHOICE/COLLOCATION")).toBe("lexical_resource");
    expect(classifyCriterion("PRONUNCIATION: WORD STRESS/INTONATION")).toBe("pronunciation");
    expect(classifyCriterion("FLUENCY: HESITATION/PAUSES")).toBe("fluency_coherence");
  });

  it("classifies looser wording from criterion_impact / drills", () => {
    expect(classifyCriterion("affects grammatical range and accuracy")).toBe(
      "grammatical_range_accuracy"
    );
    expect(classifyCriterion("limited vocabulary and collocation")).toBe("lexical_resource");
    expect(classifyCriterion("unclear intonation and word stress")).toBe("pronunciation");
    expect(classifyCriterion("too many fillers, disjointed flow")).toBe("fluency_coherence");
  });

  it("returns null when nothing matches", () => {
    expect(classifyCriterion("general practice")).toBeNull();
  });
});

describe("segmentForPart", () => {
  it("extracts one part from a newline-joined breakdown", () => {
    const text = "Part 1: hesitant delivery.\nPart 2: better flow.\nPart 3: some repetition.";
    expect(segmentForPart(text, 2)).toBe("better flow.");
    expect(segmentForPart(text, 1)).toBe("hesitant delivery.");
  });

  it("extracts one part from a space-joined note", () => {
    const text = "Part 1: work on fillers. Part 2: extend answers. Part 3: justify views.";
    expect(segmentForPart(text, 3)).toBe("justify views.");
  });

  it("returns the whole string when there is no part marker", () => {
    expect(segmentForPart("Just one paragraph.", 1)).toBe("Just one paragraph.");
  });
});

const err = (rank: number, quote?: string) => ({
  rank, error_type: "grammar", description: "d", correction: "c", quote,
});

describe("segmentTranscript", () => {
  it("highlights a quote with surrounding plain segments", () => {
    const segs = segmentTranscript("I have went to Paris last year", [err(1, "have went")]);
    expect(segs.map((s) => s.text)).toEqual(["I ", "have went", " to Paris last year"]);
    expect(segs[1].error?.rank).toBe(1);
    expect(segs[0].error).toBeUndefined();
  });

  it("matches case-insensitively and handles multiple non-overlapping quotes", () => {
    const segs = segmentTranscript("He go to work. She go to school.", [
      err(1, "HE GO"),
      err(2, "She go"),
    ]);
    const highlighted = segs.filter((s) => s.error);
    expect(highlighted).toHaveLength(2);
    expect(highlighted[0].text).toBe("He go");
    expect(highlighted[1].text).toBe("She go");
  });

  it("claims distinct occurrences when two errors share a quote", () => {
    const segs = segmentTranscript("I go and I go again", [err(1, "I go"), err(2, "I go")]);
    expect(segs.filter((s) => s.error)).toHaveLength(2);
  });

  it("survives missing or unmatched quotes", () => {
    const segs = segmentTranscript("Clean transcript.", [err(1), err(2, "not present")]);
    expect(segs).toEqual([{ text: "Clean transcript." }]);
  });
});

describe("speechMetrics", () => {
  it("counts words, fillers, and computes wpm", () => {
    const m = speechMetrics("Um I think uh it is er very nice hmm", 30);
    expect(m.fillers).toBe(4);
    expect(m.words).toBe(10);
    expect(m.wpm).toBe(20);
  });

  it("does not count 'summer' or 'her' as fillers", () => {
    expect(speechMetrics("summer is her favourite era", 60).fillers).toBe(0);
  });

  it("returns null wpm without duration", () => {
    expect(speechMetrics("some words", 0).wpm).toBe(null);
    expect(speechMetrics("some words").wpm).toBe(null);
  });
});
