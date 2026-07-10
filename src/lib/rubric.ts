import type { CriterionKey } from "./report-insights";

/** One official descriptor line judged against the performance by the scorer.
 *  `band`+`line` reference SPEAKING_RUBRIC[criterion][band][line]; `quote` is
 *  verbatim transcript evidence for met lines where wording-based evidence
 *  exists. Mirrors the web repo's scoring schema. */
export interface RubricLineJudgement {
  band: number;
  line: number;
  met: boolean;
  quote?: string;
}

export type RubricAssessment = Partial<Record<CriterionKey, RubricLineJudgement[]>>;

/** Official IELTS Speaking band descriptors (public version), reproduced
 *  verbatim from ielts.org ("Speaking Band Descriptors — scoring criteria for
 *  Academic and General Training tests"). Each band cell is split into its
 *  individual descriptor lines so the report can highlight exactly which
 *  lines a performance fits. DUPLICATED from the web repo's
 *  src/lib/scoring/rubric.ts — keep the two in lockstep. */
export const SPEAKING_RUBRIC: Record<CriterionKey, Record<number, string[]>> = {
  fluency_coherence: {
    9: [
      "Fluent with only very occasional repetition or self-correction.",
      "Any hesitation that occurs is used only to prepare the content of the next utterance and not to find words or grammar.",
      "Speech is situationally appropriate and cohesive features are fully acceptable.",
      "Topic development is fully coherent and appropriately extended.",
    ],
    8: [
      "Fluent with only very occasional repetition or self-correction.",
      "Hesitation may occasionally be used to find words or grammar, but most will be content related.",
      "Topic development is coherent, appropriate and relevant.",
    ],
    7: [
      "Able to keep going and readily produce long turns without noticeable effort.",
      "Some hesitation, repetition and/or self-correction may occur, often mid-sentence and indicate problems with accessing appropriate language. However, these will not affect coherence.",
      "Flexible use of spoken discourse markers, connectives and cohesive features.",
    ],
    6: [
      "Able to keep going and demonstrates a willingness to produce long turns.",
      "Coherence may be lost at times as a result of hesitation, repetition and/or self-correction.",
      "Uses a range of spoken discourse markers, connectives and cohesive features though not always appropriately.",
    ],
    5: [
      "Usually able to keep going, but relies on repetition and self-correction to do so and/or on slow speech.",
      "Hesitations are often associated with mid-sentence searches for fairly basic lexis and grammar.",
      "Overuse of certain discourse markers, connectives and other cohesive features.",
      "More complex speech usually causes disfluency but simpler language may be produced fluently.",
    ],
    4: [
      "Unable to keep going without noticeable pauses.",
      "Speech may be slow with frequent repetition.",
      "Often self-corrects.",
      "Can link simple sentences but often with repetitious use of connectives.",
      "Some breakdowns in coherence.",
    ],
    3: [
      "Frequent, sometimes long, pauses occur while candidate searches for words.",
      "Limited ability to link simple sentences and go beyond simple responses to questions.",
      "Frequently unable to convey basic message.",
    ],
    2: [
      "Lengthy pauses before nearly every word.",
      "Isolated words may be recognisable but speech is of virtually no communicative significance.",
    ],
    1: [
      "Essentially none.",
      "Speech is totally incoherent.",
    ],
  },
  lexical_resource: {
    9: [
      "Total flexibility and precise use in all contexts.",
      "Sustained use of accurate and idiomatic language.",
    ],
    8: [
      "Wide resource, readily and flexibly used to discuss all topics and convey precise meaning.",
      "Skilful use of less common and idiomatic items despite occasional inaccuracies in word choice and collocation.",
      "Effective use of paraphrase as required.",
    ],
    7: [
      "Resource flexibly used to discuss a variety of topics.",
      "Some ability to use less common and idiomatic items and an awareness of style and collocation is evident though inappropriacies occur.",
      "Effective use of paraphrase as required.",
    ],
    6: [
      "Resource sufficient to discuss topics at length.",
      "Vocabulary use may be inappropriate but meaning is clear.",
      "Generally able to paraphrase successfully.",
    ],
    5: [
      "Resource sufficient to discuss familiar and unfamiliar topics but there is limited flexibility.",
      "Attempts paraphrase but not always with success.",
    ],
    4: [
      "Resource sufficient for familiar topics but only basic meaning can be conveyed on unfamiliar topics.",
      "Frequent inappropriacies and errors in word choice.",
      "Rarely attempts paraphrase.",
    ],
    3: [
      "Resource limited to simple vocabulary used primarily to convey personal information.",
      "Vocabulary inadequate for unfamiliar topics.",
    ],
    2: [
      "Very limited resource. Utterances consist of isolated words or memorised utterances.",
      "Little communication possible without the support of mime or gesture.",
    ],
    1: [
      "No resource bar a few isolated words.",
      "No communication possible.",
    ],
  },
  grammatical_range_accuracy: {
    9: [
      "Structures are precise and accurate at all times, apart from 'mistakes' characteristic of native speaker speech.",
    ],
    8: [
      "Wide range of structures, flexibly used.",
      "The majority of sentences are error free.",
      "Occasional inappropriacies and non-systematic errors occur. A few basic errors may persist.",
    ],
    7: [
      "A range of structures flexibly used. Error-free sentences are frequent.",
      "Both simple and complex sentences are used effectively despite some errors. A few basic errors persist.",
    ],
    6: [
      "Produces a mix of short and complex sentence forms and a variety of structures with limited flexibility.",
      "Though errors frequently occur in complex structures, these rarely impede communication.",
    ],
    5: [
      "Basic sentence forms are fairly well controlled for accuracy.",
      "Complex structures are attempted but these are limited in range, nearly always contain errors and may lead to the need for reformulation.",
    ],
    4: [
      "Can produce basic sentence forms and some short utterances are error-free.",
      "Subordinate clauses are rare and, overall, turns are short, structures are repetitive and errors are frequent.",
    ],
    3: [
      "Basic sentence forms are attempted but grammatical errors are numerous except in apparently memorised utterances.",
    ],
    2: [
      "No evidence of basic sentence forms.",
    ],
    1: [
      "No rateable language unless memorised.",
    ],
  },
  pronunciation: {
    9: [
      "Uses a full range of phonological features to convey precise and/or subtle meaning.",
      "Flexible use of features of connected speech is sustained throughout.",
      "Can be effortlessly understood throughout.",
      "Accent has no effect on intelligibility.",
    ],
    8: [
      "Uses a wide range of phonological features to convey precise and/or subtle meaning.",
      "Can sustain appropriate rhythm. Flexible use of stress and intonation across long utterances, despite occasional lapses.",
      "Can be easily understood throughout.",
      "Accent has minimal effect on intelligibility.",
    ],
    7: [
      "Displays all the positive features of band 6, and some, but not all, of the positive features of band 8.",
    ],
    6: [
      "Uses a range of phonological features, but control is variable.",
      "Chunking is generally appropriate, but rhythm may be affected by a lack of stress-timing and/or a rapid speech rate.",
      "Some effective use of intonation and stress, but this is not sustained.",
      "Individual words or phonemes may be mispronounced but this causes only occasional lack of clarity.",
      "Can generally be understood throughout without much effort.",
    ],
    5: [
      "Displays all the positive features of band 4, and some, but not all, of the positive features of band 6.",
    ],
    4: [
      "Uses some acceptable phonological features, but the range is limited.",
      "Produces some acceptable chunking, but there are frequent lapses in overall rhythm.",
      "Attempts to use intonation and stress, but control is limited.",
      "Individual words or phonemes are frequently mispronounced, causing lack of clarity.",
      "Understanding requires some effort and there may be patches of speech that cannot be understood.",
    ],
    3: [
      "Displays some features of band 2, and some, but not all, of the positive features of band 4.",
    ],
    2: [
      "Uses few acceptable phonological features (possibly because sample is insufficient).",
      "Overall problems with delivery impair attempts at connected speech.",
      "Individual words and phonemes are mainly mispronounced and little meaning is conveyed.",
      "Often unintelligible.",
    ],
    1: [
      "Can produce occasional individual words and phonemes that are recognisable, but no overall meaning is conveyed.",
      "Unintelligible.",
    ],
  },
};

export interface AggregatedRubricLine {
  text: string;
  met: boolean;
  quote?: string;
}

export interface AggregatedRubric {
  band: number;
  lines: AggregatedRubricLine[];
  /** Descriptor lines of the band above judged unmet — what's missing to level up. */
  next: { band: number; missing: string[] } | null;
}

/** Folds per-part rubric judgements into one view of a criterion at a target
 *  band (typically the merged whole band). Parts scored ABOVE the target band
 *  count as fitting its lines; parts scored below count against them (IELTS
 *  rates average performance across all parts); only parts scored AT the band
 *  contribute explicit per-line judgements and evidence quotes. Returns null
 *  when no part carries rubric data for the criterion. DUPLICATED from the
 *  web repo's src/lib/scoring/rubric.ts — keep the two in lockstep. */
export function aggregateRubric(
  perPart: {
    band_scores: Record<CriterionKey, number>;
    rubric?: RubricAssessment;
  }[],
  criterion: CriterionKey,
  targetBand: number
): AggregatedRubric | null {
  const band = Math.round(targetBand);
  const lines = SPEAKING_RUBRIC[criterion]?.[band];
  if (!lines) return null;
  const withRubric = perPart.filter((p) => (p.rubric?.[criterion]?.length ?? 0) > 0);
  if (withRubric.length === 0) return null;

  const aggregated: AggregatedRubricLine[] = lines.map((text, i) => {
    let anyTrue = false;
    let anyFalse = false;
    let quote: string | undefined;
    for (const p of withRubric) {
      const partBand = Math.round(p.band_scores[criterion] ?? 0);
      if (partBand > band) { anyTrue = true; continue; }
      if (partBand < band) { anyFalse = true; continue; }
      const j = p.rubric?.[criterion]?.find((e) => e.band === band && e.line === i);
      if (!j) continue;
      if (j.met) {
        anyTrue = true;
        if (!quote && j.quote) quote = j.quote;
      } else {
        anyFalse = true;
      }
    }
    return { text, met: anyTrue && !anyFalse, ...(quote ? { quote } : {}) };
  });

  let next: AggregatedRubric["next"] = null;
  const nextLines = SPEAKING_RUBRIC[criterion]?.[band + 1];
  if (nextLines) {
    const missingIdx = new Set<number>();
    for (const p of withRubric) {
      for (const e of p.rubric?.[criterion] ?? []) {
        if (e.band === band + 1 && !e.met) missingIdx.add(e.line);
      }
    }
    const missing = [...missingIdx]
      .sort((a, b) => a - b)
      .map((i) => nextLines[i])
      .filter((t): t is string => !!t);
    if (missing.length > 0) next = { band: band + 1, missing };
  }
  return { band, lines: aggregated, next };
}
