import { describe, expect, it } from "vitest";
import { encodeWavPcm16Mono } from "./wav";

describe("encodeWavPcm16Mono", () => {
  it("produces an exact RIFF header for known input", () => {
    const wav = encodeWavPcm16Mono([new Int16Array([0, 1, -1])], 16000);
    // 44-byte header + 6 data bytes
    expect(wav.length).toBe(50);
    const ascii = (from: number, to: number) =>
      String.fromCharCode(...wav.subarray(from, to));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 12)).toBe("WAVE");
    expect(ascii(12, 16)).toBe("fmt ");
    expect(ascii(36, 40)).toBe("data");
    const view = new DataView(wav.buffer, wav.byteOffset);
    expect(view.getUint32(4, true)).toBe(42);      // file size - 8
    expect(view.getUint16(20, true)).toBe(1);      // PCM format
    expect(view.getUint16(22, true)).toBe(1);      // mono
    expect(view.getUint32(24, true)).toBe(16000);  // sample rate
    expect(view.getUint32(28, true)).toBe(32000);  // byte rate = sr * 2
    expect(view.getUint16(32, true)).toBe(2);      // block align
    expect(view.getUint16(34, true)).toBe(16);     // bits per sample
    expect(view.getUint32(40, true)).toBe(6);      // data size
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(1);
    expect(view.getInt16(48, true)).toBe(-1);
  });

  it("concatenates multiple chunks in order", () => {
    const wav = encodeWavPcm16Mono([new Int16Array([1, 2]), new Int16Array([3])], 16000);
    const view = new DataView(wav.buffer, wav.byteOffset);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(1);
    expect(view.getInt16(46, true)).toBe(2);
    expect(view.getInt16(48, true)).toBe(3);
  });
});
