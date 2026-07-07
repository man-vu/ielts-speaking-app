import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { apiFetch } from "@/src/lib/api";
import type { ReportPayload } from "@/src/lib/types";
import { overline, theme } from "@/src/lib/theme";

const AUTO_RESCORE_DELAY_MS = 20_000;

const CRITERIA: { key: string; label: string }[] = [
  { key: "fluency_coherence", label: "Fluency & Coherence" },
  { key: "lexical_resource", label: "Lexical Resource" },
  { key: "grammatical_range_accuracy", label: "Grammatical Range & Accuracy" },
  { key: "pronunciation", label: "Pronunciation" },
];

function AudioButton({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  return (
    <Pressable style={styles.playButton} onPress={() => (player.playing ? player.pause() : player.play())}>
      <Text style={styles.playText}>Play / pause recording</Text>
    </Pressable>
  );
}

export default function ReportScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const [rescoring, setRescoring] = useState(false);
  const [rescoreError, setRescoreError] = useState("");
  const autoRescoreAttemptedRef = useRef(false);

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
        <Text style={error ? styles.error : styles.muted}>{error || "Loading…"}</Text>
      </View>
    );
  }
  if (payload.status === "aborted") {
    return <View style={styles.center}><Text style={styles.muted}>This session was aborted before scoring.</Text></View>;
  }
  if (payload.status !== "scored" || !payload.report) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Scoring your performance…</Text>
        <Text style={styles.hint}>This usually takes under a minute. Checking automatically.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {payload.status === "completed" && (
          <>
            <Pressable
              style={styles.button}
              onPress={() => void rescore()}
              disabled={rescoring}
            >
              <Text style={styles.buttonText}>{rescoring ? "Retrying…" : "Retry scoring now"}</Text>
            </Pressable>
            {rescoreError ? <Text style={styles.error}>{rescoreError}</Text> : null}
          </>
        )}
      </View>
    );
  }

  const r = payload.report;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: "Your report" }} />
      <View style={styles.hero}>
        <View style={styles.stamp}>
          <Text style={[overline, styles.stampLabel]}>Overall band</Text>
          <Text style={styles.heroBand}>{r.band_scores.overall.toFixed(1)}</Text>
        </View>
        <Text style={styles.note}>{r.examiner_note}</Text>
      </View>
      {CRITERIA.map(({ key, label }) => (
        <View key={key} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{label}</Text>
            <Text style={styles.band}>
              {((r.band_scores as unknown) as Record<string, number>)[key]?.toFixed(1)}
            </Text>
          </View>
          <Text style={styles.muted}>{r.criterion_breakdown[key]}</Text>
        </View>
      ))}
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
        return (
          <View key={p.part} style={styles.card}>
            <Text style={styles.cardTitle}>Part {p.part} — band {p.band_scores.overall.toFixed(1)}</Text>
            {rec && <AudioButton url={rec.url} />}
            <Text style={styles.muted}>{p.transcript}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, gap: 10 },
  hero: { alignItems: "center", gap: 16, paddingVertical: 14 },
  stamp: {
    alignItems: "center", gap: 2, paddingVertical: 18, paddingHorizontal: 34,
    borderWidth: 2, borderColor: theme.brass, borderRadius: 8,
    transform: [{ rotate: "-1.5deg" }],
  },
  stampLabel: { color: theme.brass },
  heroBand: {
    fontFamily: theme.fontDisplayBold, color: theme.ink, fontSize: 62, lineHeight: 68,
    fontVariant: ["tabular-nums"],
  },
  note: { color: theme.inkSecondary, textAlign: "center", fontSize: 14.5, lineHeight: 21 },
  card: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 16, gap: 8,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
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
  playButton: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.borderSoft,
    borderRadius: 8, padding: 11, alignItems: "center",
  },
  playText: { color: theme.info, fontSize: 13.5 },
  button: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, paddingVertical: 13, paddingHorizontal: 26, alignItems: "center", marginTop: 12,
  },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15 },
});
