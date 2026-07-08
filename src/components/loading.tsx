import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { theme } from "@/src/lib/theme";

/** Themed fetch-wait indicator — brass spinner + quiet label. */
export function Loading({ label = "One moment…" }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={theme.brass} size="small" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12, padding: 24 },
  label: { color: theme.inkMuted, fontSize: 13.5 },
});
