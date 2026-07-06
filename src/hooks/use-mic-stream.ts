import { useCallback, useRef } from "react";
import { AudioRecorder } from "react-native-audio-api";
import { floatTo16BitPcm } from "@/src/lib/audio/pcm";

const SAMPLE_RATE = 16000;

/** Streams mic audio as 16 kHz mono Int16 chunks (~0.1 s each). */
export function useMicStream() {
  const recorderRef = useRef<AudioRecorder | null>(null);

  const start = useCallback(async (
    onChunk: (pcm: Int16Array) => void,
    onError?: (message: string) => void
  ) => {
    if (recorderRef.current) return; // already streaming
    const recorder = new AudioRecorder();
    // onAudioReady also resolves a discriminated Result — check it the same
    // way as start()'s below.
    const readyResult = recorder.onAudioReady(
      {
        sampleRate: SAMPLE_RATE,
        bufferLength: SAMPLE_RATE * 0.1,
        channelCount: 1,
      },
      ({ buffer }) => {
        // buffer is an AudioBuffer (not a raw Float32Array) — pull channel 0.
        onChunk(floatTo16BitPcm(buffer.getChannelData(0)));
      }
    );
    if (readyResult.status === "error") {
      throw new Error(readyResult.message);
    }
    if (onError) {
      recorder.onError((error) => {
        console.error("[use-mic-stream] recorder error:", error.message);
        onError(error.message);
      });
    }
    // start() is async and resolves a discriminated Result — await it and
    // check status (the "error" branch always carries a message).
    const result = await recorder.start();
    if (result.status === "error") {
      throw new Error(result.message);
    }
    recorderRef.current = recorder;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.clearOnAudioReady();
    recorder.clearOnError();
    void recorder.stop();
    recorderRef.current = null;
  }, []);

  return { start, stop };
}
