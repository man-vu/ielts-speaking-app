import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { apiFetch } from "@/src/lib/api";
import type { ReportPayload } from "@/src/lib/types";

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

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}/report`, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ReportPayload;
        if (stop) return;
        setPayload(body);
        if (body.status !== "scored" && body.status !== "aborted") {
          timer = setTimeout(() => void poll(), 5000);
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Failed to load report");
      }
    }
    void poll();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  if (error) return <View style={styles.center}><Text style={styles.error}>{error}</Text></View>;
  if (!payload) return <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>;
  if (payload.status === "aborted") {
    return <View style={styles.center}><Text style={styles.muted}>This session was aborted before scoring.</Text></View>;
  }
  if (payload.status !== "scored" || !payload.report) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Scoring your performance…</Text>
        <Text style={styles.hint}>This usually takes under a minute. Checking automatically.</Text>
      </View>
    );
  }

  const r = payload.report;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: "Your report" }} />
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Overall band</Text>
        <Text style={styles.heroBand}>{r.band_scores.overall.toFixed(1)}</Text>
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
  container: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 8 },
  hero: { backgroundColor: "#312e8155", borderRadius: 16, padding: 24, alignItems: "center", gap: 6 },
  heroLabel: { color: "#a5b4fc", textTransform: "uppercase", fontSize: 12, letterSpacing: 1 },
  heroBand: { color: "#f1f5f9", fontSize: 56, fontWeight: "700" },
  note: { color: "#cbd5e1", textAlign: "center" },
  card: { borderWidth: 1, borderColor: "#334155", borderRadius: 12, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  cardTitle: { color: "#f1f5f9", fontWeight: "600" },
  band: { color: "#818cf8", fontSize: 20, fontWeight: "700" },
  muted: { color: "#94a3b8", fontSize: 13, lineHeight: 19 },
  hint: { color: "#64748b", fontSize: 12 },
  error: { color: "#f87171" },
  errorItem: { gap: 2, marginTop: 6 },
  errorHead: { color: "#fca5a5", fontWeight: "600", fontSize: 13 },
  fix: { color: "#6ee7b7", fontSize: 13 },
  playButton: { backgroundColor: "#4f46e522", borderRadius: 8, padding: 10, alignItems: "center" },
  playText: { color: "#818cf8" },
});
