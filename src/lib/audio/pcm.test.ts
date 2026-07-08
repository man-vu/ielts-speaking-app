import { describe, expect, it } from "vitest";
import {
  base64ToInt16, floatTo16BitPcm, int16ToBase64, resample24to16,
} from "./pcm";

describe("floatTo16BitPcm", () => {
  it("clamps and scales [-1,1] floats to int16", () => {
    const out = floatTo16BitPcm(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767);
    expect(out[2]).toBe(-32768);
    expect(out[3]).toBe(32767);   // clamped
    expect(out[4]).toBe(-32768);  // clamped
    expect(out[5]).toBeCloseTo(16383, -1);
  });
});

describe("resample24to16", () => {
  it("produces 2/3 length with linear interpolation", () => {
    const out = resample24to16(new Int16Array([0, 300, 600, 900, 1200, 1500]));
    expect(Array.from(out)).toEqual([0, 450, 900, 1350]);
  });

  it("holds duration: 24k samples in ≈ 16k samples out per second", () => {
    expect(resample24to16(new Int16Array(24000)).length).toBe(16000);
  });
});

describe("base64 round-trip", () => {
  it("int16 → base64 → int16 is lossless", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 12345]);
    expect(base64ToInt16(int16ToBase64(pcm))).toEqual(pcm);
  });

  it("handles large arrays with chunked encoding (50k samples)", () => {
    const pcm = new Int16Array(50000);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = ((i * 37) % 65536) - 32768;
    }
    const roundtrip = base64ToInt16(int16ToBase64(pcm));
    expect(roundtrip).toEqual(pcm);
  });

  it("respects byteOffset in Int16Array views", () => {
    const backing = new Int16Array([9, 1, 2, 3, 9]);
    const view = backing.subarray(1, 4);
    const roundtrip = base64ToInt16(int16ToBase64(view));
    expect(roundtrip).toEqual(new Int16Array([1, 2, 3]));
  });
});
