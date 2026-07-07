import { StyleSheet, Text, View } from "react-native";
import { overline, theme } from "@/src/lib/theme";

/** Styled like the physical exam cue card — cream paper on the dark desk. */
export function CueCard({ text, secondsLeft }: { text: string; secondsLeft: number | null }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[overline, styles.label]}>Part 2 · Cue card</Text>
        {secondsLeft !== null && (
          <Text style={styles.timer}>
            0:{String(secondsLeft).padStart(2, "0")}
          </Text>
        )}
      </View>
      <Text style={styles.body}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.ink, borderRadius: 12, padding: 18, gap: 12,
    borderWidth: 1, borderColor: theme.brass,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: "#8A7A55" },
  timer: {
    fontFamily: theme.fontMonoBold, fontSize: 18, color: theme.stampRed,
    fontVariant: ["tabular-nums"],
  },
  body: { color: "#211D14", fontSize: 16.5, lineHeight: 25, fontWeight: "500" },
});
