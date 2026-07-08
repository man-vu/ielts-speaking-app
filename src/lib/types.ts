import type { UNIT_COSTS } from "./config";

export type SimMode = keyof typeof UNIT_COSTS;
export type SimStatus = "in_progress" | "completed" | "scored" | "aborted";

export interface ExamDisplayData {
  mode: SimMode;
  part1TopicNames: string[];
  cueCard: string | null;
  part3Title: string | null;
  examiner?: { key: string; name: string; initial: string; voice: string };
}

export interface TokenResponse {
  sessionId: string;
  token: string;
  model: string;
  display: ExamDisplayData;
}

export interface BandScores {
  fluency_coherence: number;
  lexical_resource: number;
  grammatical_range_accuracy: number;
  pronunciation: number;
  overall: number;
}

export interface ReportPayload {
  status: SimStatus;
  mode: SimMode;
  /** Part 2/3 topic slug — enables "practice this topic again". */
  part23Slug?: string | null;
  /** Interleaved conversation transcript (client-collected ASR). */
  dialogue?: { role: "examiner" | "candidate"; text: string; part: number | null }[] | null;
  report: {
    band_scores: BandScores;
    criterion_breakdown: Record<string, string>;
    per_part: { part: number; transcript: string; band_scores: BandScores }[];
    priority_errors: {
      part: number; rank: number; error_type: string; description: string;
      criterion_impact: string; correction: string;
      /** Verbatim transcript substring for inline highlighting (newer reports only). */
      quote?: string;
    }[];
    drill_queue: { drill_name: string; target_error: string; instruction: string }[];
    examiner_note: string;
  } | null;
  audio: { part: number; url: string; duration?: number }[];
}
