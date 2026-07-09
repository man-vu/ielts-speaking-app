import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { HallBackdrop } from "@/src/components/hall-backdrop";
import { lastLocalResults, type LocalBands } from "@/src/lib/local-scorer";
import { overline, theme } from "@/src/lib/theme";

const CRITERIA: [keyof LocalBands, string][] = [
  ["fluency_coherence", "Fluency & coherence"],
  ["lexical_resource", "Lexical resource"],
  ["grammatical_range_accuracy", "Grammatical range"],
  ["pronunciation", "Pronunciation"],
];

export default function LocalReport() {
  const results = lastLocalResults();
  return (
    <View style={styles.root}>
      <HallBackdrop />
      <Stack.Screen options={{ title: "Local score" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[overline, styles.tag]}>Scored on your PC · free · offline</Text>
        {results.length === 0 ? (
          <Text style={styles.muted}>No local result to show.</Text>
        ) : (
          results.map((r) => (
            <View key={r.part} style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.title}>Part {r.part}</Text>
                <Text style={styles.overall}>{r.bands.overall.toFixed(1)}</Text>
              </View>
              {CRITERIA.map(([key, label]) => (
                <View key={key} style={styles.row}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <View style={styles.track}>
                    <View
                      style={[styles.fill, { width: `${((r.bands[key] as number) / 9) * 100}%` }]}
                    />
                  </View>
                  <Text style={styles.rowVal}>{r.bands[key] as number}</Text>
                </View>
              ))}
              {r.bands.feedback?.pronunciation ? (
                <Text style={styles.fb}>{r.bands.feedback.fluency_coherence}</Text>
              ) : null}
              {r.transcript ? (
                <Text style={styles.muted} numberOfLines={4}>
                  {r.transcript}
                </Text>
              ) : null}
            </View>
          ))
        )}
        <Pressable style={styles.done} onPress={() => router.replace("/")} accessibilityRole="button">
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingTop: 16, gap: 14 },
  tag: { color: theme.live, textAlign: "center" },
  card: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 16, gap: 8,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 17 },
  overall: {
    fontFamily: theme.fontMonoBold, color: theme.brass, fontSize: 22,
    fontVariant: ["tabular-nums"],
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { flex: 1, color: theme.inkSecondary, fontSize: 13 },
  track: {
    width: 90, height: 5, borderRadius: 3, backgroundColor: theme.borderSoft, overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 3, backgroundColor: theme.brass },
  rowVal: {
    width: 18, textAlign: "right", fontFamily: theme.fontMono, color: theme.ink, fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  fb: { color: theme.inkSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  muted: { color: theme.inkMuted, fontSize: 12.5, lineHeight: 18 },
  done: {
    alignSelf: "center", marginTop: 8, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 40,
  },
  doneText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15 },
});
