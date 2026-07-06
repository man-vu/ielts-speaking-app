import { StyleSheet, Text, View } from "react-native";

export function CueCard({ text, secondsLeft }: { text: string; secondsLeft: number | null }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Part 2 — Cue card</Text>
        {secondsLeft !== null && <Text style={styles.timer}>Prep: {secondsLeft}s</Text>}
      </View>
      <Text style={styles.body}>{text}</Text>
      {secondsLeft !== null && (
        <Text style={styles.hint}>Make notes if you like — you'll speak for up to 2 minutes.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: "#b4530999", backgroundColor: "#451a0355", borderRadius: 12, padding: 16, gap: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: "#fcd34d", fontWeight: "600" },
  timer: { color: "#fde68a", fontVariant: ["tabular-nums"] },
  body: { color: "#f1f5f9", lineHeight: 22 },
  hint: { color: "#fde68a99", fontSize: 12 },
});
