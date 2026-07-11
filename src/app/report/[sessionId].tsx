import { useEffect, useRef, useState } from "react";
import {
  Alert, Animated, Pressable, ScrollView, Share, StyleSheet, Text, View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { setAudioModeAsync } from "expo-audio";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { AudioScrubber } from "@/src/components/audio-scrubber";
import { Assessing } from "@/src/components/assessing";
import { Loading } from "@/src/components/loading";
import { HallBackdrop } from "@/src/components/hall-backdrop";
import { apiFetch } from "@/src/lib/api";
import {
  classifyCriterion, segmentForPart, segmentTranscript, speechMetrics,
  type CriterionKey,
} from "@/src/lib/report-insights";
import { aggregateRubric } from "@/src/lib/rubric";
import { LOCAL_SCORER_URL } from "@/src/lib/config";
import { scoreSessionLocally } from "@/src/lib/local-scorer";
import { track } from "@/src/lib/telemetry";
import type { ReportPayload } from "@/src/lib/types";
import { overline, theme } from "@/src/lib/theme";

const AUTO_RESCORE_DELAY_MS = 20_000;

// One entry per criterion: `tab` is the short segmented-control label, `full`
// the detail-card heading. The report shows one criterion at a time so a
// single-part report stays short instead of stacking four long cards.
const CRIT_TABS: { key: CriterionKey; tab: string; full: string }[] = [
  { key: "fluency_coherence", tab: "Fluency", full: "Fluency & Coherence" },
  { key: "lexical_resource", tab: "Lexical", full: "Lexical Resource" },
  { key: "grammatical_range_accuracy", tab: "Grammar", full: "Grammatical Range & Accuracy" },
  { key: "pronunciation", tab: "Pron", full: "Pronunciation" },
];

export default function ReportScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const [rescoring, setRescoring] = useState(false);
  const [rescoreError, setRescoreError] = useState("");
  const autoRescoreAttemptedRef = useRef(false);
  const stampAnim = useRef(new Animated.Value(0)).current;
  const stampedRef = useRef(false);
  const [copiedPart, setCopiedPart] = useState<number | null>(null);
  const [band8Open, setBand8Open] = useState<number | null>(null);
  const [band8Busy, setBand8Busy] = useState(false);
  const [band8Audio, setBand8Audio] = useState<Record<number, string>>({});
  const [band8AudioBusy, setBand8AudioBusy] = useState<number | null>(null);
  // Which part the report is scoped to: "overall" (whole exam) or a part number.
  const [activePart, setActivePart] = useState<number | "overall">("overall");
  // Which criterion's detail card is shown (the criteria sub-tabs).
  const [activeCriterion, setActiveCriterion] = useState<CriterionKey>("fluency_coherence");
  // Per-part transcript expansion — collapsed by default to keep reports short.
  const [transcriptOpen, setTranscriptOpen] = useState<Record<number, boolean>>({});
  const [localBusy, setLocalBusy] = useState(false);
  const [rubricBusy, setRubricBusy] = useState(false);
  const autoRubricAttemptedRef = useRef(false);

  // Official-descriptor judgements are backfilled automatically for reports
  // scored before the rubric feature and merged into the payload in place.
  // Runs unprompted, so failures are silent — the prose breakdown still
  // renders, and reopening the report retries.
  async function generateRubric() {
    if (rubricBusy) return;
    setRubricBusy(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/rubric`, { method: "POST" });
      const body = (await res.json()) as {
        per_part?: NonNullable<ReportPayload["report"]>["per_part"];
        error?: string;
      };
      if (!res.ok || !body.per_part) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPayload((prev) =>
        prev?.report
          ? { ...prev, report: { ...prev.report, per_part: body.per_part! } }
          : prev
      );
    } catch {
      // Silent: automatic generation must never interrupt reading the report.
    } finally {
      setRubricBusy(false);
    }
  }

  // Fetch (server generates once, then caches) the spoken Band 8 answer.
  async function fetchBand8Audio(part: number) {
    if (band8AudioBusy !== null || band8Audio[part]) return;
    setBand8AudioBusy(part);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/band8-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? `HTTP ${res.status}`);
      setBand8Audio((prev) => ({ ...prev, [part]: body.url! }));
    } catch (e) {
      Alert.alert("Could not prepare the audio", e instanceof Error ? e.message : "");
    } finally {
      setBand8AudioBusy(null);
    }
  }

  // Band 8 rewrites are generated on demand (per dialogue turn when the
  // conversation was captured, per part otherwise) and merged into the
  // payload in place. Returns true on success so callers can flip the view.
  async function generateBand8(): Promise<boolean> {
    if (band8Busy) return false;
    setBand8Busy(true);
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/band8`, { method: "POST" });
      const body = (await res.json()) as {
        per_part?: NonNullable<ReportPayload["report"]>["per_part"];
        dialogue?: ReportPayload["dialogue"];
        error?: string;
      };
      if (!res.ok || !body.per_part) throw new Error(body.error ?? `HTTP ${res.status}`);
      setPayload((prev) =>
        prev?.report
          ? {
              ...prev,
              dialogue: body.dialogue ?? prev.dialogue,
              report: { ...prev.report, per_part: body.per_part! },
            }
          : prev
      );
      return true;
    } catch (e) {
      Alert.alert("Could not generate Band 8 answers", e instanceof Error ? e.message : "");
      return false;
    } finally {
      setBand8Busy(false);
    }
  }
  const [discarding, setDiscarding] = useState(false);

  function copyTranscript(part: number, transcript: string) {
    void Clipboard.setStringAsync(transcript).catch(() => {});
    void Haptics.selectionAsync().catch(() => {});
    setCopiedPart(part);
    setTimeout(() => setCopiedPart((p) => (p === part ? null : p)), 1600);
  }

  // The band arrives like a stamp coming down: scale + rotation settle with a
  // success haptic, once, when the scored report first renders.
  useEffect(() => {
    if (payload?.status !== "scored" || !payload.report || stampedRef.current) return;
    stampedRef.current = true;
    track("report_viewed", { band: payload.report.band_scores.overall });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.spring(stampAnim, {
      toValue: 1, useNativeDriver: true, damping: 14, stiffness: 240, mass: 0.9,
    }).start();
  }, [payload, stampAnim]);

  // I5a: recordings must play even when the hardware silent switch is on.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}/report`, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ReportPayload;
        if (stop) return;
        setError("");
        setPayload(body);
        if (body.status !== "scored" && body.status !== "aborted") {
          timer = setTimeout(() => void poll(), 5000);
        }
      } catch (err) {
        if (stop) return;
        // Minor 6: a transient fetch error must not stop polling — show the
        // banner but keep retrying every 5 s (recovery, not a dead end).
        setError(err instanceof Error ? err.message : "Failed to load report");
        timer = setTimeout(() => void poll(), 5000);
      }
    }
    void poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  async function rescore() {
    if (rescoring) return;
    setRescoring(true);
    setRescoreError("");
    try {
      await apiFetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      // Ignore the response — the 5 s poll above picks up the resulting status.
    } catch (err) {
      setRescoreError(err instanceof Error ? err.message : "Rescore failed — try again in a minute.");
    } finally {
      setRescoring(false);
    }
  }

  // C1c: a session stuck in "completed" (uploaded but never scored, e.g. the
  // score call's response never made it back) gets one automatic rescore
  // attempt, mirroring the web's ScoringPending behavior.
  useEffect(() => {
    if (payload?.status !== "completed") return;
    if (autoRescoreAttemptedRef.current) return;
    autoRescoreAttemptedRef.current = true;
    const timer = setTimeout(() => void rescore(), AUTO_RESCORE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.status]);

  // Reports scored before the rubric feature get their official-descriptor
  // judgement generated automatically on open — no button, once per visit.
  useEffect(() => {
    if (payload?.status !== "scored" || !payload.report) return;
    if (autoRubricAttemptedRef.current) return;
    const parts = payload.report.per_part;
    if (parts.some((p) => p.rubric)) return; // newer report — already judged
    if (!parts.some((p) => p.transcript?.trim().length > 20)) return; // nothing to judge
    autoRubricAttemptedRef.current = true;
    void generateRubric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  if (!payload) {
    return (
      <View style={styles.center}>
        <HallBackdrop />
        <Stack.Screen options={{ title: "Your report" }} />
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Loading label="Opening your report…" />
        )}
      </View>
    );
  }
  if (payload.status === "aborted") {
    return (
      <View style={styles.center}>
        <HallBackdrop />
        <Stack.Screen options={{ title: "Your report" }} />
        <Text style={styles.muted}>This session was aborted before scoring.</Text>
      </View>
    );
  }
  // A session still "in_progress" here was never finished (the app died or
  // the exam was abandoned) — nothing will ever arrive, so an eternal
  // Assessing screen would be a lie. Offer to discard instead.
  if (payload.status === "in_progress") {
    return (
      <View style={styles.center}>
        <HallBackdrop />
        <Stack.Screen options={{ title: "Your report" }} />
        <Text style={styles.muted}>
          This exam was never finished, so there is nothing to score.
        </Text>
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          disabled={discarding}
          onPress={() => {
            if (discarding) return;
            setDiscarding(true);
            void apiFetch(`/api/sessions/${sessionId}/abort`, { method: "POST" })
              .catch(() => {})
              .finally(() => router.back());
          }}
        >
          <Text style={styles.buttonText}>
            {discarding ? "Discarding…" : "Discard this session"}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (payload.status !== "scored" || !payload.report) {
    return (
      <View style={styles.assessingWrap}>
        <HallBackdrop />
        <Stack.Screen options={{ title: "Your report" }} />
        <Assessing />
        {(error || rescoreError || payload.status === "completed") && (
          <View style={styles.assessingFooter}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {payload.status === "completed" && (
              <Pressable
                style={styles.button}
                onPress={() => void rescore()}
                disabled={rescoring}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>{rescoring ? "Retrying…" : "Retry scoring now"}</Text>
              </Pressable>
            )}
            {rescoreError ? <Text style={styles.error}>{rescoreError}</Text> : null}
          </View>
        )}
      </View>
    );
  }

  const r = payload.report;
  // The report is scoped to "overall" (whole exam) or a single part via the
  // part tabs. Scoped views read that part's bands, the extracted slice of the
  // per-part-concatenated breakdown/note, and only that part's errors/sections.
  const partList = r.per_part.map((p) => p.part);
  const activeBands =
    activePart === "overall"
      ? r.band_scores
      : r.per_part.find((p) => p.part === activePart)?.band_scores ?? r.band_scores;
  const scopedNote =
    activePart === "overall" ? r.examiner_note : segmentForPart(r.examiner_note, activePart);
  const scopedErrors =
    activePart === "overall"
      ? r.priority_errors
      : r.priority_errors.filter((e) => e.part === activePart);
  const scopedParts = r.per_part.filter((p) => activePart === "overall" || p.part === activePart);
  const activeCritMeta = CRIT_TABS.find((c) => c.key === activeCriterion) ?? CRIT_TABS[0];
  const activeCritValue = ((activeBands as unknown) as Record<string, number>)[activeCriterion] ?? 0;
  const activeCritBreakdown =
    activePart === "overall"
      ? r.criterion_breakdown[activeCriterion]
      : segmentForPart(r.criterion_breakdown[activeCriterion], activePart);
  // Priority fixes and drills follow the selected criterion tab. Items whose
  // criterion can't be classified (null) stay visible under every tab so no
  // fix is ever hidden.
  const critErrors = scopedErrors.filter((e) => {
    const c = classifyCriterion(`${e.criterion_impact} ${e.error_type} ${e.description}`);
    return c === null || c === activeCriterion;
  });
  const critDrills = r.drill_queue.filter((d) => {
    const c = classifyCriterion(`${d.target_error} ${d.drill_name} ${d.instruction}`);
    return c === null || c === activeCriterion;
  });
  // Official-descriptor view for the criterion card, following the same
  // scope as everything else: one part's own judgements, or all parts folded
  // into the merged band. activeCritValue is already the scoped whole band.
  const rubric = aggregateRubric(
    r.per_part.filter((p) => activePart === "overall" || p.part === activePart),
    activeCriterion,
    activeCritValue
  );
  return (
    <View style={{ flex: 1 }}>
      <HallBackdrop />
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: "Your report" }} />
      <View style={styles.hero}>
        <Animated.View
          style={[
            styles.stamp,
            {
              opacity: stampAnim,
              transform: [
                { scale: stampAnim.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
                { rotate: stampAnim.interpolate({ inputRange: [0, 1], outputRange: ["-9deg", "-1.5deg"] }) },
              ],
            },
          ]}
        >
          <Text style={[overline, styles.stampLabel]}>
            {activePart === "overall" ? "Overall band" : `Part ${activePart} band`}
          </Text>
          <Text style={styles.heroBand}>{activeBands.overall.toFixed(1)}</Text>
        </Animated.View>
        {partList.length > 1 && (
          <View style={styles.partTabs}>
            {(["overall", ...partList] as const).map((p) => {
              const on = activePart === p;
              return (
                <Pressable
                  key={p}
                  style={[styles.partTab, on && styles.partTabOn]}
                  onPress={() => setActivePart(p)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.partTabText, on && styles.partTabTextOn]}>
                    {p === "overall" ? "Overall" : `Part ${p}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable
          style={styles.shareButton}
          onPress={() => {
            void (async () => {
              try {
                const res = await apiFetch(`/api/sessions/${sessionId}/share-link`, { method: "GET" });
                const body = (await res.json()) as { url?: string; error?: string };
                if (!res.ok || !body.url) throw new Error(body.error ?? `HTTP ${res.status}`);
                track("share_created", {});
                await Share.share({ message: `My IELTS Speaking practice report: ${body.url}` });
              } catch (e) {
                Alert.alert("Could not create share link", e instanceof Error ? e.message : "");
              }
            })();
          }}
        >
          <Text style={styles.shareText}>Share with a teacher</Text>
        </Pressable>
        {LOCAL_SCORER_URL ? (
          <Pressable
            style={styles.shareButton}
            disabled={localBusy}
            accessibilityRole="button"
            onPress={() => {
              setLocalBusy(true);
              scoreSessionLocally(sessionId)
                .then((parts) => {
                  if (parts.length === 0) {
                    Alert.alert("Nothing to score locally",
                      "This attempt has no phone-recorded (.wav) audio.");
                  } else {
                    router.push("/local-report");
                  }
                })
                .catch((e) =>
                  Alert.alert("Local scoring failed",
                    `Is the PC server running?\n${e instanceof Error ? e.message : ""}`))
                .finally(() => setLocalBusy(false));
            }}
          >
            <Text style={styles.shareText}>
              {localBusy ? "Scoring on your PC…" : "Re-score on my PC (free)"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.critTabs}>
        {CRIT_TABS.map(({ key, tab }) => {
          const on = activeCriterion === key;
          const v = ((activeBands as unknown) as Record<string, number>)[key] ?? 0;
          return (
            <Pressable
              key={key}
              style={[styles.critTab, on && styles.critTabOn]}
              onPress={() => setActiveCriterion(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tab}
            >
              <Text style={[styles.critTabLabel, on && styles.critTabLabelOn]} numberOfLines={1}>
                {tab}
              </Text>
              <Text style={[styles.critTabScore, on && styles.critTabScoreOn]}>{v.toFixed(1)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{activeCritMeta.full}</Text>
          <Text style={styles.band}>{activeCritValue.toFixed(1)}</Text>
        </View>
        <View style={styles.critTrack}>
          <View style={[styles.critFill, { width: `${(activeCritValue / 9) * 100}%` }]} />
        </View>
        {rubric ? (
          <View style={styles.rubricBox}>
            <Text style={styles.rubricLabel}>
              Official descriptors · Band {rubric.band}
            </Text>
            {rubric.lines.map((l, i) => (
              <Pressable
                key={i}
                disabled={!(l.met && l.quote)}
                onPress={() =>
                  Alert.alert(
                    `${activeCritMeta.full} — Band ${rubric.band}`,
                    `${l.text}\n\nFrom your answer:\n"${l.quote}"`
                  )
                }
                accessibilityRole={l.met && l.quote ? "button" : undefined}
              >
                <View style={styles.rubricRow}>
                  <Text
                    style={[
                      styles.rubricMark,
                      l.met ? styles.rubricMarkMet : styles.rubricMarkUnmet,
                    ]}
                  >
                    {l.met ? "✓" : "○"}
                  </Text>
                  <Text
                    style={[
                      styles.rubricText,
                      l.met ? styles.rubricTextMet : styles.rubricTextUnmet,
                    ]}
                  >
                    {l.text}
                  </Text>
                </View>
              </Pressable>
            ))}
            {rubric.lines.some((l) => l.met && l.quote) && (
              <Text style={styles.hint}>
                Tap an underlined line to see the evidence from your answer.
              </Text>
            )}
            {rubric.next && (
              <>
                <Text style={[styles.rubricLabel, styles.rubricNextLabel]}>
                  To reach band {rubric.next.band}
                </Text>
                {rubric.next.missing.map((t, i) => (
                  <View key={i} style={styles.rubricRow}>
                    <Text style={[styles.rubricMark, styles.rubricMarkNext]}>→</Text>
                    <Text style={[styles.rubricText, styles.rubricTextNext]}>{t}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ) : rubricBusy ? (
          <Text style={styles.hint}>
            Matching your answers against the official band descriptors…
          </Text>
        ) : null}
        <Text style={styles.muted}>{activeCritBreakdown}</Text>
      </View>
      {scopedNote ? (
        <View style={styles.focusBox}>
          <View style={styles.focusBadge}>
            <Text style={styles.focusBadgeText}>↑</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.focusLabel}>Focus to reach band 8</Text>
            <Text style={styles.focusText}>{scopedNote}</Text>
          </View>
        </View>
      ) : null}
      {critErrors.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Priority fixes · {activeCritMeta.tab}</Text>
          {critErrors.map((e, i) => (
            <View key={i} style={styles.errorItem}>
              <Text style={styles.errorHead}>#{e.rank} · {e.error_type} · Part {e.part}</Text>
              <Text style={styles.muted}>{e.description}</Text>
              <Text style={styles.fix}>✓ {e.correction}</Text>
            </View>
          ))}
        </View>
      )}
      {critDrills.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Practice drills · {activeCritMeta.tab}</Text>
          {critDrills.map((d, i) => (
            <View key={i} style={styles.errorItem}>
              <Text style={styles.errorHead}>{d.drill_name} ({d.target_error})</Text>
              <Text style={styles.muted}>{d.instruction}</Text>
            </View>
          ))}
        </View>
      )}
      {scopedParts.map((p) => {
        const rec = payload.audio.find((a) => a.part === p.part);
        const metrics = speechMetrics(p.transcript, rec?.duration);
        const open = !!transcriptOpen[p.part];
        const partErrors = r.priority_errors.filter((e) => e.part === p.part);
        const segments = segmentTranscript(p.transcript, partErrors);
        // Messenger-style thread when the interleaved dialogue was captured;
        // candidate bubbles carry the same tap-to-fix highlighting (quotes are
        // matched best-effort against the ASR text of each bubble).
        const turns = (payload.dialogue ?? [])
          .filter((d) => d.part === p.part && d.text.trim())
          .slice(0, 80);
        const renderHighlighted = (text: string) =>
          segmentTranscript(text, partErrors).map((seg, i) =>
            seg.error ? (
              <Text
                key={i}
                style={seg.error.rank <= 2 ? styles.errorSpanHigh : styles.errorSpanMid}
                onPress={() =>
                  Alert.alert(
                    `${seg.error!.error_type} — priority #${seg.error!.rank}`,
                    `${seg.error!.description}\n\n✓ ${seg.error!.correction}`
                  )
                }
              >
                {seg.text}
              </Text>
            ) : (
              <Text key={i}>{seg.text}</Text>
            )
          );
        const anyHighlight = turns.length
          ? turns.some(
              (t) =>
                t.role === "candidate" &&
                segmentTranscript(t.text, partErrors).some((s) => s.error)
            )
          : segments.some((s) => s.error);
        return (
          <View key={p.part} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Part {p.part} — band {p.band_scores.overall.toFixed(1)}</Text>
              <Pressable
                onPress={() => copyTranscript(p.part, p.transcript)}
                accessibilityRole="button"
                accessibilityLabel={`Copy Part ${p.part} transcript`}
                hitSlop={8}
              >
                <Text style={styles.copyLink}>{copiedPart === p.part ? "Copied ✓" : "Copy"}</Text>
              </Pressable>
            </View>
            <View style={styles.metricsRow}>
              {metrics.wpm !== null && (
                <Text style={styles.metric}>{metrics.wpm} wpm</Text>
              )}
              <Text style={styles.metric}>{metrics.words} words</Text>
              <Text style={[styles.metric, metrics.fillers > 3 && styles.metricWarn]}>
                {metrics.fillers} filler{metrics.fillers === 1 ? "" : "s"}
              </Text>
            </View>
            {rec && <AudioScrubber url={rec.url} />}
            <Pressable
              style={styles.transcriptToggle}
              onPress={() => setTranscriptOpen((prev) => ({ ...prev, [p.part]: !prev[p.part] }))}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              hitSlop={8}
            >
              <Text style={styles.transcriptToggleText}>
                {open ? "Hide transcript ▴" : `Show transcript ▾  ·  ${metrics.words} words`}
              </Text>
            </Pressable>
            {open && (
              <>
            {turns.length > 0 ? (
              <View style={styles.thread}>
                {turns.map((d, i) => {
                  if (d.role === "examiner") {
                    return (
                      <View key={i} style={[styles.bubble, styles.bubbleExaminer]}>
                        <Text style={styles.bubbleExaminerText}>{d.text.trim()}</Text>
                      </View>
                    );
                  }
                  const showB8 = band8Open === p.part && !!d.band8?.trim();
                  return (
                    <View
                      key={i}
                      style={[styles.bubble, styles.bubbleCandidate, showB8 && styles.bubbleBand8]}
                    >
                      <Text style={styles.bubbleCandidateText}>
                        {showB8 ? d.band8!.trim() : renderHighlighted(d.text.trim())}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.muted}>{renderHighlighted(p.transcript)}</Text>
            )}
            {anyHighlight && band8Open !== p.part && (
              <Text style={styles.hint}>Tap a highlighted phrase to see the fix.</Text>
            )}
            {turns.length > 0 ? (
              <>
                <Pressable
                  onPress={() => {
                    if (band8Open === p.part) return setBand8Open(null);
                    const anyTurnB8 = turns.some(
                      (t) => t.role === "candidate" && t.band8?.trim()
                    );
                    if (anyTurnB8) return setBand8Open(p.part);
                    void generateBand8().then((ok) => ok && setBand8Open(p.part));
                  }}
                  disabled={band8Busy}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={[styles.band8Head, band8Busy && { opacity: 0.5 }]}>
                    {band8Busy
                      ? "Rewriting your answers at Band 8…"
                      : band8Open === p.part
                        ? "★ Showing Band 8 — tap to see your original"
                        : "★ Show my answers at Band 8"}
                  </Text>
                </Pressable>
                {band8Open === p.part &&
                  (band8Audio[p.part] ? (
                    <AudioScrubber url={band8Audio[p.part]} />
                  ) : (
                    <Pressable
                      onPress={() => void fetchBand8Audio(p.part)}
                      disabled={band8AudioBusy !== null}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Text
                        style={[styles.band8Listen, band8AudioBusy === p.part && { opacity: 0.5 }]}
                      >
                        {band8AudioBusy === p.part
                          ? "Preparing the audio…"
                          : "🔊 Hear the Band 8 conversation"}
                      </Text>
                    </Pressable>
                  ))}
              </>
            ) : p.model_answer ? (
              <View style={styles.band8Box}>
                <Pressable
                  onPress={() => setBand8Open(band8Open === p.part ? null : p.part)}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.band8Head}>
                    ★ Your answer at Band 8 {band8Open === p.part ? "▾" : "▸"}
                  </Text>
                </Pressable>
                {band8Open === p.part && (
                  <>
                    <Text style={styles.band8Text}>{p.model_answer.trim()}</Text>
                    {band8Audio[p.part] ? (
                      <AudioScrubber url={band8Audio[p.part]} />
                    ) : (
                      <Pressable
                        onPress={() => void fetchBand8Audio(p.part)}
                        disabled={band8AudioBusy !== null}
                        accessibilityRole="button"
                        hitSlop={8}
                      >
                        <Text
                          style={[
                            styles.band8Listen,
                            band8AudioBusy === p.part && { opacity: 0.5 },
                          ]}
                        >
                          {band8AudioBusy === p.part
                            ? "Preparing the audio…"
                            : "🔊 Hear it spoken at Band 8"}
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            ) : p.transcript.trim().length > 20 ? (
              <View style={styles.band8Box}>
                <Pressable
                  onPress={() => void generateBand8()}
                  disabled={band8Busy}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={[styles.band8Head, band8Busy && { opacity: 0.5 }]}>
                    {band8Busy ? "Writing your Band 8 version…" : "★ Generate my answer at Band 8"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
              </>
            )}
            {p.part === 2 && payload.part23Slug ? (
              <Pressable
                style={styles.retryTopic}
                onPress={() =>
                  router.push({
                    pathname: "/exam/part2",
                    params: { slug: payload.part23Slug as string },
                  })
                }
                accessibilityRole="button"
              >
                <Text style={styles.retryTopicText}>Practice this topic again</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, gap: 10 },
  hero: { alignItems: "center", gap: 16, paddingVertical: 14 },
  stamp: {
    alignItems: "center", gap: 2, paddingVertical: 18, paddingHorizontal: 34,
    borderWidth: 2, borderColor: theme.brass, borderRadius: 8,
  },
  stampLabel: { color: theme.brass },
  heroBand: {
    fontFamily: theme.fontDisplayBold, color: theme.ink, fontSize: 62, lineHeight: 68,
    fontVariant: ["tabular-nums"],
  },
  card: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 16, gap: 8,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  critTrack: {
    height: 5, borderRadius: 3, backgroundColor: "rgba(201, 163, 92, 0.14)",
    overflow: "hidden", marginVertical: 8,
  },
  critFill: { height: "100%", borderRadius: 3, backgroundColor: theme.brass },
  partTabs: {
    flexDirection: "row", gap: 6, alignSelf: "stretch", marginTop: 4,
  },
  partTab: {
    flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: theme.borderSoft, backgroundColor: theme.card,
  },
  partTabOn: { borderColor: theme.brass, backgroundColor: "rgba(201, 163, 92, 0.14)" },
  partTabText: { fontFamily: theme.fontMono, fontSize: 12, color: theme.inkMuted },
  partTabTextOn: { color: theme.brass },
  critTabs: { flexDirection: "row", gap: 6 },
  critTab: {
    flex: 1, alignItems: "center", gap: 3, paddingVertical: 9, borderRadius: 9,
    borderWidth: 1, borderColor: theme.borderSoft, backgroundColor: theme.card,
  },
  critTabOn: { borderColor: theme.brass, backgroundColor: "rgba(201, 163, 92, 0.14)" },
  critTabLabel: { fontFamily: theme.fontMono, fontSize: 11, color: theme.inkMuted, letterSpacing: 0.2 },
  critTabLabelOn: { color: theme.brass },
  critTabScore: {
    fontFamily: theme.fontMonoBold, fontSize: 15, color: theme.inkSecondary,
    fontVariant: ["tabular-nums"],
  },
  critTabScoreOn: { color: theme.ink },
  focusBox: {
    flexDirection: "row", gap: 11, alignItems: "flex-start",
    borderWidth: 1, borderColor: "rgba(201, 163, 92, 0.4)", borderRadius: 12,
    padding: 13, backgroundColor: "rgba(201, 163, 92, 0.07)",
  },
  focusBadge: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: theme.brass,
    alignItems: "center", justifyContent: "center",
  },
  focusBadgeText: { fontFamily: theme.fontDisplay, fontSize: 13, color: theme.brass },
  focusLabel: {
    fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: theme.brass,
  },
  focusText: { fontSize: 12.5, lineHeight: 18, color: theme.inkSecondary },
  rubricBox: { gap: 7, marginTop: 2 },
  rubricLabel: {
    fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase",
    color: theme.inkMuted, marginBottom: 2,
  },
  rubricNextLabel: { color: theme.brass, marginTop: 8 },
  rubricRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  rubricMark: {
    fontFamily: theme.fontMono, fontSize: 12, lineHeight: 18,
    width: 14, textAlign: "center",
  },
  rubricMarkMet: { color: theme.live },
  rubricMarkUnmet: { color: theme.inkMuted },
  rubricMarkNext: { color: theme.brass },
  rubricText: { flex: 1, fontSize: 13, lineHeight: 18 },
  rubricTextMet: {
    color: theme.ink, textDecorationLine: "underline",
    textDecorationColor: "rgba(201, 163, 92, 0.55)",
  },
  rubricTextUnmet: { color: theme.inkMuted },
  rubricTextNext: { color: theme.inkSecondary },
  cardTitle: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 16 },
  band: {
    fontFamily: theme.fontMonoBold, color: theme.brass, fontSize: 21,
    fontVariant: ["tabular-nums"],
  },
  muted: { color: theme.inkSecondary, fontSize: 13.5, lineHeight: 20 },
  hint: { color: theme.inkMuted, fontSize: 12 },
  error: { color: theme.stampRed, fontSize: 13 },
  errorItem: { gap: 2, marginTop: 8 },
  errorHead: { color: theme.stampRed, fontFamily: theme.fontDisplay, fontSize: 13.5 },
  fix: { color: theme.live, fontSize: 13.5 },
  assessingWrap: { flex: 1 },
  assessingFooter: { padding: 24, paddingTop: 0, gap: 10, alignItems: "center" },
  shareButton: {
    borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 20,
  },
  shareText: { color: theme.info, fontSize: 13.5 },
  copyLink: { color: theme.info, fontSize: 13 },
  transcriptToggle: {
    alignSelf: "flex-start", marginTop: 8,
    borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  transcriptToggleText: { color: theme.info, fontSize: 13 },
  band8Box: {
    borderLeftWidth: 2, borderLeftColor: theme.brass,
    paddingLeft: 12, paddingVertical: 2, gap: 8,
  },
  band8Head: { color: theme.brass, fontFamily: theme.fontDisplay, fontSize: 14 },
  band8Listen: { color: theme.info, fontSize: 13.5 },
  band8Text: { color: theme.inkSecondary, fontSize: 14, lineHeight: 21 },
  thread: { gap: 8 },
  bubble: {
    maxWidth: "84%", borderRadius: 16, paddingVertical: 9, paddingHorizontal: 13,
  },
  bubbleExaminer: {
    alignSelf: "flex-start", borderBottomLeftRadius: 4,
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.borderSoft,
  },
  bubbleCandidate: {
    alignSelf: "flex-end", borderBottomRightRadius: 4,
    backgroundColor: "rgba(201, 163, 92, 0.15)",
  },
  bubbleBand8: {
    borderWidth: 1, borderColor: theme.brass,
    backgroundColor: "rgba(201, 163, 92, 0.08)",
  },
  bubbleExaminerText: { color: theme.inkSecondary, fontSize: 14, lineHeight: 20 },
  bubbleCandidateText: { color: theme.ink, fontSize: 14, lineHeight: 20 },
  retryTopic: {
    marginTop: 8, borderWidth: 1, borderColor: theme.brass, borderRadius: 10,
    paddingVertical: 12, alignItems: "center", backgroundColor: theme.cardRaised,
  },
  retryTopicText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 14.5 },
  metricsRow: { flexDirection: "row", gap: 8 },
  metric: {
    fontFamily: theme.fontMono, fontSize: 11.5, color: theme.inkSecondary,
    backgroundColor: theme.cardRaised, borderRadius: 6,
    paddingVertical: 4, paddingHorizontal: 9, overflow: "hidden",
  },
  metricWarn: { color: theme.stampRed },
  errorSpanHigh: {
    color: theme.stampRed, textDecorationLine: "underline",
    textDecorationColor: theme.stampRed,
  },
  errorSpanMid: {
    color: theme.brass, textDecorationLine: "underline",
    textDecorationColor: theme.brass,
  },
  button: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, paddingVertical: 13, paddingHorizontal: 26, alignItems: "center", marginTop: 12,
  },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15 },
});
