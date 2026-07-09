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

export interface LocalFix {
  wrong: string;
  correction: string;
  criterion?: string;
}
export interface LocalDrill {
  name: string;
  instruction: string;
}
export interface LocalResult {
  part: number;
  bands: LocalBands;
  transcript: string;
  metrics?: Record<string, number>;
  fixes?: LocalFix[];
  drills?: LocalDrill[];
}

interface LocalScorePayload {
  bands: LocalBands;
  transcript: string;
  metrics?: Record<string, number>;
  fixes?: LocalFix[];
  drills?: LocalDrill[];
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
    const j = (await res.json()) as LocalScorePayload;
    results.push({
      part, bands: j.bands, transcript: j.transcript,
      metrics: j.metrics, fixes: j.fixes, drills: j.drills,
    });
  }
  _last = results;
  return results;
}

/** Re-score an EXISTING attempt: the PC server pulls its stored recordings from
 *  Supabase and scores them locally. Returns [] if the session has no locally
 *  scorable (.wav) parts (e.g. a web-recorded session). */
export async function scoreSessionLocally(sessionId: string): Promise<LocalResult[]> {
  const form = new FormData();
  form.append("session_id", sessionId);
  const res = await fetch(`${LOCAL_SCORER_URL}/score-session`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`local scorer HTTP ${res.status}`);
  const j = (await res.json()) as { parts: (LocalScorePayload & { part: number })[] };
  _last = j.parts.map((p) => ({
    part: p.part, bands: p.bands, transcript: p.transcript,
    metrics: p.metrics, fixes: p.fixes, drills: p.drills,
  }));
  return _last;
}
