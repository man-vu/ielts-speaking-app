import { useState } from "react";
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
  const [open, setOpen] = useState<Record<number, boolean>>({});

  return (
    <View style={styles.root}>
      <HallBackdrop />
      <Stack.Screen options={{ title: "Local score" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[overline, styles.tag]}>Scored on your PC · free · offline</Text>
        {results.length === 0 ? (
          <Text style={styles.muted}>No local result to show.</Text>
        ) : (
          results.map((r) => {
            const m = r.metrics ?? {};
            const fb = r.bands.feedback ?? {};
            return (
              <View key={r.part} style={styles.card}>
                <View style={styles.headRow}>
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

                {(m.wpm != null || m.pause_count != null) && (
                  <View style={styles.metricsRow}>
                    {m.wpm != null && <Text style={styles.metric}>{m.wpm} wpm</Text>}
                    {m.pause_count != null && (
                      <Text style={styles.metric}>{m.pause_count} pauses</Text>
                    )}
                    {m.fillers != null && (
                      <Text style={[styles.metric, m.fillers > 3 && styles.metricWarn]}>
                        {m.fillers} fillers
                      </Text>
                    )}
                  </View>
                )}

                {CRITERIA.map(([key, label]) =>
                  fb[key] ? (
                    <View key={`fb-${key}`} style={styles.fbBlock}>
                      <Text style={[overline, styles.fbLabel]}>{label}</Text>
                      <Text style={styles.fbText}>{fb[key]}</Text>
                    </View>
                  ) : null
                )}

                {r.fixes && r.fixes.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Priority fixes</Text>
                    {r.fixes.map((f, i) => (
                      <View key={i} style={styles.fixItem}>
                        <Text style={styles.wrong}>{f.wrong}</Text>
                        <Text style={styles.right}>✓ {f.correction}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {r.drills && r.drills.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Practice drills</Text>
                    {r.drills.map((d, i) => (
                      <View key={i} style={styles.drillItem}>
                        <Text style={styles.drillName}>{d.name}</Text>
                        <Text style={styles.muted}>{d.instruction}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {r.transcript ? (
                  <Pressable
                    onPress={() => setOpen((p) => ({ ...p, [r.part]: !p[r.part] }))}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    <Text style={styles.transcriptToggle}>
                      {open[r.part] ? "Hide transcript ▴" : "Show transcript ▾"}
                    </Text>
                  </Pressable>
                ) : null}
                {open[r.part] && <Text style={styles.muted}>{r.transcript}</Text>}
              </View>
            );
          })
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
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
  metricsRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  metric: {
    fontFamily: theme.fontMono, fontSize: 11.5, color: theme.inkSecondary,
    backgroundColor: theme.cardRaised, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 9,
    overflow: "hidden",
  },
  metricWarn: { color: theme.stampRed },
  fbBlock: { gap: 2, marginTop: 2 },
  fbLabel: { color: theme.inkMuted, fontSize: 9.5 },
  fbText: { color: theme.inkSecondary, fontSize: 13, lineHeight: 19 },
  section: { gap: 6, marginTop: 4 },
  sectionTitle: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 14.5 },
  fixItem: { gap: 1 },
  wrong: {
    color: theme.stampRed, fontSize: 13.5, lineHeight: 20,
    textDecorationLine: "line-through", textDecorationColor: theme.stampRed,
  },
  right: { color: theme.live, fontSize: 13.5, lineHeight: 20 },
  drillItem: { gap: 1 },
  drillName: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 13.5 },
  muted: { color: theme.inkMuted, fontSize: 12.5, lineHeight: 18 },
  transcriptToggle: { color: theme.info, fontSize: 13, marginTop: 4 },
  done: {
    alignSelf: "center", marginTop: 8, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 40,
  },
  doneText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15 },
});
