import { describe, expect, it } from "vitest";
import { deriveQuestion, findExaminerQuestion, type DialogueTurn } from "./phrasebook-questions";

const dialogue: DialogueTurn[] = [
  { role: "examiner", text: "Do you drive?", part: 1 },
  { role: "candidate", text: "No, because I can drive is not true, I cannot drive yet.", part: 1 },
  { role: "examiner", text: "Would you like to learn?", part: 1 },
  { role: "candidate", text: "Yes I would love to learn how to drive a car someday.", part: 1 },
  { role: "examiner", text: "Now, describe a trip you enjoyed.", part: 2 },
];

describe("findExaminerQuestion", () => {
  it("matches a quote to its candidate turn and returns the preceding examiner turn", () => {
    expect(findExaminerQuestion(dialogue, 1, "because I can drive")).toBe("Do you drive?");
    expect(findExaminerQuestion(dialogue, 1, "learn how to drive a car")).toBe(
      "Would you like to learn?"
    );
  });

  it("returns null when overlap is too weak (never attaches a wrong question)", () => {
    expect(findExaminerQuestion(dialogue, 1, "elephants roam the savanna")).toBeNull();
  });

  it("returns null when the part has no matching turns", () => {
    expect(findExaminerQuestion(dialogue, 3, "because I can drive")).toBeNull();
  });
});

describe("deriveQuestion", () => {
  it("uses the cue card for Part 2 (exact)", () => {
    const q = deriveQuestion(
      { part: 2, quote: "anything" },
      { dialogue, topic_payload: { cueCard: "Describe a place you visited\nYou should say:\n- when" } }
    );
    expect(q).toBe("Describe a place you visited");
  });

  it("uses dialogue matching for Part 1", () => {
    expect(
      deriveQuestion({ part: 1, quote: "because I can drive" }, { dialogue, topic_payload: {} })
    ).toBe("Do you drive?");
  });

  it("falls back to the Part 3 context when dialogue can't be matched", () => {
    expect(
      deriveQuestion(
        { part: 3, quote: "totally unrelated words here" },
        { dialogue, topic_payload: { part3Context: "The role of technology in society\nmore detail" } }
      )
    ).toBe("The role of technology in society");
  });

  it("returns null when nothing is available", () => {
    expect(deriveQuestion({ part: 1, quote: "xyz" }, null)).toBeNull();
    expect(deriveQuestion({ part: 3 }, { topic_payload: {} })).toBeNull();
  });
});
