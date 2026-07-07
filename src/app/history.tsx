import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { Skeleton } from "@/src/components/skeleton";
import { overline, theme } from "@/src/lib/theme";

interface Bands {
  overall?: number;
  fluency_coherence?: number;
  lexical_resource?: number;
  grammatical_range_accuracy?: number;
  pronunciation?: number;
}
interface Row {
  id: string;
  mode: string;
  status: string;
  created_at: string;
  sim_evaluations: { band_scores: Bands } | { band_scores: Bands }[] | null;
}

const MODE_LABELS: Record<string, string> = {
  full: "Full exam", part1: "Part 1", part2: "Part 2", part3: "Part 3",
};
const CRITERIA: { key: keyof Bands; label: string }[] = [
  { key: "fluency_coherence", label: "Fluency" },
  { key: "lexical_resource", label: "Lexis" },
  { key: "grammatical_range_accuracy", label: "Grammar" },
  { key: "pronunciation", label: "Pron." },
];

function bandsOf(row: Row): Bands | null {
  const evaluation = Array.isArray(row.sim_evaluations)
    ? row.sim_evaluations[0]
    : row.sim_evaluations;
  return evaluation?.band_scores ?? null;
}

/** Band-trend bars (last 10 scored sessions, oldest→newest). Single series:
 *  validated amber marks, full 0–9 scale, 2px gaps, direct label on the
 *  latest bar only — the session list below is the data table. */
function TrendChart({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  return (
    <View style={styles.chartBlock}>
      <Text style={overline}>Band trend</Text>
      <View style={styles.chartRow}>
        {points.map((band, i) => {
          const latest = i === points.length - 1;
          return (
            <View key={i} style={styles.chartCol}>
              {latest && <Text style={styles.chartLabel}>{band.toFixed(1)}</Text>}
              <View
                style={[
                  styles.chartBar,
                  { height: Math.max(4, (band / 9) * 56) },
                  latest && styles.chartBarLatest,
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function History() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void supabase
        .from("sim_sessions")
        .select("id, mode, status, created_at, sim_evaluations(band_scores)")
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => {
          if (cancelled) return;
          if (data) setRows(data as unknown as Row[]);
          setLoaded(true);
        });
      return () => { cancelled = true; };
    }, [])
  );

  const scored = rows.filter((r) => r.status === "scored" && bandsOf(r)?.overall !== undefined);
  const trend = scored
    .slice(0, 10)
    .reverse()
    .map((r) => bandsOf(r)?.overall ?? 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = rows.filter((r) => r.created_at.startsWith(monthKey)).length;
  const avg = (key: keyof Bands): string => {
    const vals = scored.map((r) => bandsOf(r)?.[key]).filter((v): v is number => v !== undefined);
    if (vals.length === 0) return "—";
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "History" }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
        ListHeaderComponent={
          scored.length > 0 ? (
            <View style={styles.stats}>
              <TrendChart points={trend} />
              <View style={styles.tileRow}>
                {CRITERIA.map(({ key, label }) => (
                  <View key={key} style={styles.tile}>
                    <Text style={styles.tileValue}>{avg(key)}</Text>
                    <Text style={[overline, styles.tileLabel]}>{label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.monthLine}>
                {thisMonth} session{thisMonth === 1 ? "" : "s"} this month · averages over your
                last {scored.length} scored
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loaded ? (
            <Text style={styles.muted}>No sessions yet.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              <Skeleton height={64} radius={12} />
              <Skeleton height={64} radius={12} />
              <Skeleton height={64} radius={12} />
            </View>
          )
        }
        renderItem={({ item }) => {
          const overall = bandsOf(item)?.overall;
          return (
            <Pressable
              onPress={() => router.push(`/report/${item.id}`)}
              style={styles.row}
              accessibilityRole="button"
            >
              <View>
                <Text style={styles.mode}>{MODE_LABELS[item.mode] ?? item.mode}</Text>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleDateString(undefined, {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </Text>
              </View>
              <Text style={overall !== undefined && item.status === "scored" ? styles.band : styles.state}>
                {item.status === "scored" && overall !== undefined
                  ? overall.toFixed(1)
                  : item.status.replace("_", " ")}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  stats: {
    gap: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 16, marginBottom: 16,
  },
  chartBlock: { gap: 10 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 78 },
  chartCol: { alignItems: "center", gap: 4, justifyContent: "flex-end" },
  chartBar: { width: 16, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: theme.chartAmber },
  chartBarLatest: { backgroundColor: theme.brass },
  chartLabel: {
    fontFamily: theme.fontMonoBold, fontSize: 12, color: theme.ink,
    fontVariant: ["tabular-nums"],
  },
  tileRow: { flexDirection: "row", gap: 8 },
  tile: {
    flex: 1, alignItems: "center", gap: 2, paddingVertical: 10,
    backgroundColor: theme.cardRaised, borderRadius: 8,
  },
  tileValue: {
    fontFamily: theme.fontMonoBold, fontSize: 18, color: theme.ink,
    fontVariant: ["tabular-nums"],
  },
  tileLabel: { fontSize: 9.5, letterSpacing: 1.4 },
  monthLine: { color: theme.inkMuted, fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 15,
  },
  mode: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15.5 },
  date: { color: theme.inkMuted, fontSize: 12, marginTop: 2 },
  band: {
    fontFamily: theme.fontMonoBold, fontSize: 19, color: theme.brass,
    fontVariant: ["tabular-nums"],
  },
  state: { color: theme.inkMuted, fontSize: 12.5, fontStyle: "italic" },
  muted: { color: theme.inkMuted, textAlign: "center", marginTop: 40 },
});
