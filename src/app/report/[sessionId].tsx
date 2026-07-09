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
import { segmentTranscript, speechMetrics } from "@/src/lib/report-insights";
import { track } from "@/src/lib/telemetry";
import type { ReportPayload } from "@/src/lib/types";
import { overline, theme } from "@/src/lib/theme";

const AUTO_RESCORE_DELAY_MS = 20_000;

const BAR_LABELS: { key: string; label: string }[] = [
  { key: "fluency_coherence", label: "Fluency & coherence" },
  { key: "lexical_resource", label: "Lexical resource" },
  { key: "grammatical_range_accuracy", label: "Grammatical range" },
  { key: "pronunciation", label: "Pronunciation" },
];

const CRITERIA: { key: string; label: string }[] = [
  { key: "fluency_coherence", label: "Fluency & Coherence" },
  { key: "lexical_resource", label: "Lexical Resource" },
  { key: "grammatical_range_accuracy", label: "Grammatical Range & Accuracy" },
  { key: "pronunciation", label: "Pronunciation" },
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
          <Text style={[overline, styles.stampLabel]}>Overall band</Text>
          <Text style={styles.heroBand}>{r.band_scores.overall.toFixed(1)}</Text>
        </Animated.View>
        <View style={styles.barsBlock}>
          {BAR_LABELS.map(({ key, label }) => {
            const value = ((r.band_scores as unknown) as Record<string, number>)[key] ?? 0;
            return (
              <View key={key}>
                <View style={styles.barRow}>
                  <Text style={styles.barLabel}>{label}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(value / 9) * 100}%` }]} />
                  </View>
                  <Text style={styles.barValue}>{value.toFixed(1)}</Text>
                </View>
                {r.per_part.length > 1 && (
                  <View style={styles.partChipRow}>
                    {r.per_part.map((p) => (
                      <Text key={p.part} style={styles.partChip}>
                        P{p.part} {((p.band_scores as unknown) as Record<string, number>)[key] ?? 0}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
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
      </View>
      {CRITERIA.map(({ key, label }) => {
        const value = ((r.band_scores as unknown) as Record<string, number>)[key] ?? 0;
        return (
          <View key={key} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{label}</Text>
              <Text style={styles.band}>{value.toFixed(1)}</Text>
            </View>
            <View style={styles.critTrack}>
              <View style={[styles.critFill, { width: `${(value / 9) * 100}%` }]} />
            </View>
            <Text style={styles.muted}>{r.criterion_breakdown[key]}</Text>
          </View>
        );
      })}
      {r.examiner_note ? (
        <View style={styles.focusBox}>
          <View style={styles.focusBadge}>
            <Text style={styles.focusBadgeText}>↑</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.focusLabel}>Focus to reach band 8</Text>
            <Text style={styles.focusText}>{r.examiner_note}</Text>
          </View>
        </View>
      ) : null}
      {r.priority_errors.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Priority fixes</Text>
          {r.priority_errors.map((e, i) => (
            <View key={i} style={styles.errorItem}>
              <Text style={styles.errorHead}>#{e.rank} · {e.error_type} · Part {e.part}</Text>
              <Text style={styles.muted}>{e.description}</Text>
              <Text style={styles.fix}>✓ {e.correction}</Text>
            </View>
          ))}
        </View>
      )}
      {r.drill_queue.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Practice drills</Text>
          {r.drill_queue.map((d, i) => (
            <View key={i} style={styles.errorItem}>
              <Text style={styles.errorHead}>{d.drill_name} ({d.target_error})</Text>
              <Text style={styles.muted}>{d.instruction}</Text>
            </View>
          ))}
        </View>
      )}
      {r.per_part.map((p) => {
        const rec = payload.audio.find((a) => a.part === p.part);
        const metrics = speechMetrics(p.transcript, rec?.duration);
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
  partChipRow: { flexDirection: "row", gap: 6, marginTop: 5 },
  partChip: {
    fontFamily: theme.fontMono, fontSize: 11, color: theme.inkSecondary,
    backgroundColor: theme.cardRaised, borderRadius: 5,
    paddingVertical: 3, paddingHorizontal: 8, overflow: "hidden",
    fontVariant: ["tabular-nums"],
  },
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
  barsBlock: { alignSelf: "stretch", gap: 13, paddingVertical: 6 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  barLabel: { flex: 1, fontSize: 13, color: theme.inkSecondary },
  barTrack: {
    width: 110, height: 6, borderRadius: 3, backgroundColor: theme.borderSoft,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: theme.brass },
  barValue: {
    // 30 wrapped "5.0" onto two lines at the capped 1.25× Dynamic Type.
    fontFamily: theme.fontMono, fontSize: 13, color: theme.ink, width: 38,
    textAlign: "right", fontVariant: ["tabular-nums"],
  },
  shareButton: {
    borderWidth: 1, borderColor: theme.borderSoft, borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 20,
  },
  shareText: { color: theme.info, fontSize: 13.5 },
  copyLink: { color: theme.info, fontSize: 13 },
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
