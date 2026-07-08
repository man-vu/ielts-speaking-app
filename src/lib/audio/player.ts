import { AudioContext, type AudioBufferSourceNode } from "react-native-audio-api";
import { base64ToInt16 } from "./pcm";

/** Gapless queued playback of Live API output audio (24 kHz mono PCM16).
 *  Same contract and scheduling as the web implementation. */
export class Pcm24kPlayer {
  muted = false;
  private closed = false;
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private active = new Set<AudioBufferSourceNode>();

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: 24000 });
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Create the AudioContext up front so session-level audio config asserted
   *  afterwards (voiceChat/AEC) governs it, instead of the lazy creation
   *  during the first examiner chunk resetting the session. */
  prime(): void {
    this.ensureCtx();
  }

  /** True while examiner audio is audibly playing or scheduled ahead —
   *  drives half-duplex mic gating (no send while the examiner speaks). */
  get isPlaying(): boolean {
    if (!this.ctx || this.active.size === 0) return false;
    return this.nextStartTime > this.ctx.currentTime;
  }

  enqueue(base64Pcm: string): void {
    if (this.muted || this.closed) return;
    const ctx = this.ensureCtx();
    const pcm = base64ToInt16(base64Pcm);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) floats[i] = pcm[i] / 0x8000;

    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onEnded = () => this.active.delete(source);

    const startAt = Math.max(ctx.currentTime, this.nextStartTime);
    source.start(startAt);
    this.active.add(source);
    this.nextStartTime = startAt + buffer.duration;
  }

  stop(): void {
    for (const source of this.active) {
      try { source.stop(); } catch { /* already stopped */ }
      // Belt to stop()'s braces: a native impl may not cancel a source whose
      // scheduled start is still in the future — detaching it from the
      // destination silences it regardless (an exam that "ended" must not
      // keep talking through the results screen).
      try { source.disconnect(); } catch { /* already detached */ }
    }
    this.active.clear();
    this.nextStartTime = 0;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.muted = true;
    this.stop();
    if (this.ctx) await this.ctx.close();
    this.ctx = null;
  }
}
