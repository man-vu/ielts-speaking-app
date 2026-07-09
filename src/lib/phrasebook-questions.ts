/** Derives the examiner's question behind a phrasebook correction. Exact for
 *  Part 2 (a single cue card); for Part 1/3 it matches the error's verbatim
 *  quote to the closest candidate turn in the captured dialogue and returns
 *  the examiner turn just before it, falling back to the part topic when the
 *  match is too weak to trust. Pure — unit-tested in the node env. */

export interface DialogueTurn {
  role: string;
  text: string;
  part: number | null;
}

export interface TopicPayload {
  part1Contexts?: string[];
  cueCard?: string | null;
  part3Context?: string | null;
}

export interface QuestionSource {
  dialogue?: DialogueTurn[] | null;
  topic_payload?: TopicPayload | null;
}

export interface ErrorLike {
  part?: number;
  quote?: string;
}

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function firstLine(s: string): string {
  return s.split("\n")[0].trim().slice(0, 160);
}

/** Best-matching examiner question for a candidate quote within one part.
 *  Returns null when no candidate turn overlaps the quote strongly enough —
 *  a wrong question is worse than none. */
export function findExaminerQuestion(
  dialogue: DialogueTurn[],
  part: number,
  quote: string
): string | null {
  const turns = dialogue.filter((d) => d.part === part);
  const q = words(quote);
  if (q.length === 0) return null;

  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].role !== "candidate") continue;
    const bag = new Set(words(turns[i].text));
    const score = q.filter((w) => bag.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx === -1 || bestScore < Math.max(2, Math.ceil(q.length * 0.4))) return null;

  for (let j = bestIdx - 1; j >= 0; j--) {
    if (turns[j].role === "examiner" && turns[j].text.trim()) return turns[j].text.trim();
  }
  return null;
}

export function deriveQuestion(err: ErrorLike, src: QuestionSource | null | undefined): string | null {
  const part = err.part;
  const tp = src?.topic_payload ?? null;
  if (part === 2) return tp?.cueCard ? firstLine(tp.cueCard) : null;
  if (src?.dialogue && err.quote && part !== undefined) {
    const found = findExaminerQuestion(src.dialogue, part, err.quote);
    if (found) return found;
  }
  if (part === 3 && tp?.part3Context) return firstLine(tp.part3Context);
  return null;
}
