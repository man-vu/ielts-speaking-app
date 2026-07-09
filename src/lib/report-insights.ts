/** Pure helpers behind the report screen's inline error highlighting and
 *  speech metrics — separated for unit testing. */

export interface HighlightError {
  rank: number;
  error_type: string;
  description: string;
  correction: string;
  quote?: string;
}

export interface TranscriptSegment {
  text: string;
  error?: HighlightError;
}

/** Splits a transcript into plain and error-highlighted segments by locating
 *  each error's verbatim quote (first unclaimed case-insensitive match).
 *  Errors without quotes, or whose quotes don't appear, highlight nothing. */
export function segmentTranscript(
  transcript: string,
  errors: HighlightError[]
): TranscriptSegment[] {
  const lower = transcript.toLowerCase();
  const claims: { start: number; end: number; error: HighlightError }[] = [];

  for (const error of errors) {
    const quote = error.quote?.trim();
    if (!quote) continue;
    const needle = quote.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      const end = idx + needle.length;
      const overlaps = claims.some((c) => idx < c.end && end > c.start);
      if (!overlaps) {
        claims.push({ start: idx, end, error });
        break;
      }
      from = idx + 1;
    }
  }

  claims.sort((a, b) => a.start - b.start);
  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  for (const claim of claims) {
    if (claim.start > cursor) segments.push({ text: transcript.slice(cursor, claim.start) });
    segments.push({ text: transcript.slice(claim.start, claim.end), error: claim.error });
    cursor = claim.end;
  }
  if (cursor < transcript.length) segments.push({ text: transcript.slice(cursor) });
  return segments.length > 0 ? segments : [{ text: transcript }];
}

/** merge.ts concatenates each part's criterion breakdown as
 *  "Part 1: …\nPart 2: …" and the examiner note as "Part 1: … Part 2: …"
 *  (space-joined). Extracts a single part's segment; returns the whole string
 *  when no "Part N:" marker is present (single-part or unexpected shape). */
export function segmentForPart(text: string, part: number): string {
  const marker = `Part ${part}: `;
  const segs = text
    .split(/(?=Part \d+: )/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const hit = segs.find((s) => s.startsWith(marker));
  return hit ? hit.slice(marker.length).trim() : text;
}

const FILLER_PATTERN = /\b(?:um+|uh+|er+|erm+|hmm+)\b/gi;

export interface SpeechMetrics {
  words: number;
  /** Words per minute; null when duration is unknown/zero. */
  wpm: number | null;
  fillers: number;
}

export function speechMetrics(transcript: string, durationSeconds?: number): SpeechMetrics {
  const words = transcript.split(/\s+/).filter((w) => /\w/.test(w)).length;
  const fillers = transcript.match(FILLER_PATTERN)?.length ?? 0;
  const wpm =
    durationSeconds && durationSeconds > 0
      ? Math.round((words / durationSeconds) * 60)
      : null;
  return { words, wpm, fillers };
}
