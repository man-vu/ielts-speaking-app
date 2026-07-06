import { describe, expect, it } from "vitest";
import { PartAccumulator } from "./part-accumulator";

describe("PartAccumulator", () => {
  it("tracks parts, duration, and produces WAVs per part", () => {
    const acc = new PartAccumulator(16000);
    acc.add(1, new Int16Array(16000)); // 1s
    acc.add(1, new Int16Array(8000));  // +0.5s
    acc.add(3, new Int16Array(16000));
    expect(acc.parts()).toEqual([1, 3]);
    expect(acc.durationSeconds(1)).toBeCloseTo(1.5, 3);
    expect(acc.durationSeconds(2)).toBe(0);
    const wav = acc.toWav(1);
    const view = new DataView(wav.buffer, wav.byteOffset);
    expect(view.getUint32(40, true)).toBe(24000 * 2); // 24000 samples * 2 bytes
  });

  it("clear() empties everything", () => {
    const acc = new PartAccumulator(16000);
    acc.add(2, new Int16Array(100));
    acc.clear();
    expect(acc.parts()).toEqual([]);
  });
});
