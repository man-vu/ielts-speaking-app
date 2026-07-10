import { describe, expect, it } from "vitest";
import { SPEAKING_RUBRIC, aggregateRubric } from "./rubric";
import type { CriterionKey } from "./report-insights";

describe("SPEAKING_RUBRIC", () => {
  it("covers bands 1–9 for all four criteria with non-empty lines", () => {
    const criteria = Object.keys(SPEAKING_RUBRIC) as CriterionKey[];
    expect(criteria).toHaveLength(4);
    for (const criterion of criteria) {
      for (let band = 1; band <= 9; band++) {
        const lines = SPEAKING_RUBRIC[criterion][band];
        expect(lines, `${criterion} band ${band}`).toBeDefined();
        expect(lines.length, `${criterion} band ${band}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("aggregateRubric", () => {
  const bands = (fc: number) => ({
    fluency_coherence: fc, lexical_resource: 6,
    grammatical_range_accuracy: 6, pronunciation: 6, overall: 6,
  });
  const part = (
    fc: number,
    judgements: { band: number; line: number; met: boolean; quote?: string }[]
  ) => ({
    band_scores: bands(fc),
    rubric: { fluency_coherence: judgements },
  });

  it("returns null when no part carries rubric data for the criterion", () => {
    expect(
      aggregateRubric([{ band_scores: bands(6) }], "fluency_coherence", 6)
    ).toBeNull();
  });

  it("highlights only explicitly evidenced lines and carries quotes", () => {
    const agg = aggregateRubric(
      [part(6, [
        { band: 6, line: 0, met: true, quote: "so I keep talking" },
        { band: 6, line: 1, met: false },
      ])],
      "fluency_coherence",
      6
    );
    expect(agg?.lines[0].met).toBe(true);
    expect(agg?.lines[0].quote).toBe("so I keep talking");
    expect(agg?.lines[1].met).toBe(false);
    expect(agg?.lines[2].met).toBe(false); // never judged → not highlighted
  });

  it("parts above the band count as met, below as unmet", () => {
    const at = part(6, [{ band: 6, line: 0, met: true }]);
    const above = part(7, [{ band: 7, line: 0, met: true }]);
    const below = part(5, [{ band: 5, line: 0, met: true }]);
    expect(aggregateRubric([above, at], "fluency_coherence", 6)?.lines[0].met).toBe(true);
    expect(aggregateRubric([below, at], "fluency_coherence", 6)?.lines[0].met).toBe(false);
  });

  it("lists unmet next-band lines; band 9 has no next", () => {
    const agg = aggregateRubric(
      [part(6, [
        { band: 7, line: 0, met: false },
        { band: 7, line: 1, met: true },
      ])],
      "fluency_coherence",
      6
    );
    expect(agg?.next).toEqual({
      band: 7,
      missing: [SPEAKING_RUBRIC.fluency_coherence[7][0]],
    });
    const nine = aggregateRubric(
      [part(9, [{ band: 9, line: 0, met: true }])],
      "fluency_coherence",
      9
    );
    expect(nine?.next).toBeNull();
  });
});
