import { encodeWavPcm16Mono } from "./wav";

/** Accumulates the mic's PCM chunks per exam part; the same stream that
 *  feeds Gemini Live becomes the scoring recording. */
export class PartAccumulator {
  private store = new Map<1 | 2 | 3, Int16Array[]>();

  constructor(private readonly sampleRate: number) {}

  add(part: 1 | 2 | 3, chunk: Int16Array): void {
    const chunks = this.store.get(part) ?? [];
    chunks.push(chunk);
    this.store.set(part, chunks);
  }

  durationSeconds(part: 1 | 2 | 3): number {
    const chunks = this.store.get(part) ?? [];
    return chunks.reduce((sum, c) => sum + c.length, 0) / this.sampleRate;
  }

  parts(): (1 | 2 | 3)[] {
    return [...this.store.keys()].sort((a, b) => a - b);
  }

  toWav(part: 1 | 2 | 3): Uint8Array {
    return encodeWavPcm16Mono(this.store.get(part) ?? [], this.sampleRate);
  }

  clear(): void {
    this.store.clear();
  }
}
