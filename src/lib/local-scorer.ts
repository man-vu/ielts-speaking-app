import { File, Paths } from "expo-file-system";
import { LOCAL_SCORER_URL } from "@/src/lib/config";

export interface LocalBands {
  fluency_coherence: number;
  lexical_resource: number;
  grammatical_range_accuracy: number;
  pronunciation: number;
  overall: number;
  feedback?: Record<string, string>;
}

export interface LocalResult {
  part: number;
  bands: LocalBands;
  transcript: string;
}

/** Minimal shape of PartAccumulator we need — avoids importing its full type. */
interface AccLike {
  parts(): (1 | 2 | 3)[];
  toWav(part: 1 | 2 | 3): Uint8Array;
}

let _last: LocalResult[] = [];
/** The most recent local scoring result, read by the /local-report screen. */
export const lastLocalResults = (): LocalResult[] => _last;

/** POST each part's mic WAV to the local PC scorer over LAN and collect bands.
 *  Throws on any network/HTTP failure so the caller can fall back to cloud. */
export async function scoreLocally(acc: AccLike): Promise<LocalResult[]> {
  const results: LocalResult[] = [];
  for (const part of acc.parts()) {
    const file = new File(Paths.cache, `local-part${part}.wav`);
    file.write(acc.toWav(part));
    const form = new FormData();
    form.append("audio", {
      uri: file.uri,
      name: `part${part}.wav`,
      type: "audio/wav",
    } as unknown as Blob);
    form.append("part", String(part));
    const res = await fetch(`${LOCAL_SCORER_URL}/score`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`local scorer HTTP ${res.status}`);
    const j = (await res.json()) as { bands: LocalBands; transcript: string };
    results.push({ part, bands: j.bands, transcript: j.transcript });
  }
  _last = results;
  return results;
}
