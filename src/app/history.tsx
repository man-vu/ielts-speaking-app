import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/src/lib/supabase";

interface Row {
  id: string;
  mode: string;
  status: string;
  created_at: string;
  sim_evaluations: { band_scores: { overall?: number } } | { band_scores: { overall?: number } }[] | null;
}

const MODE_LABELS: Record<string, string> = {
  full: "Full exam", part1: "Part 1", part2: "Part 2", part3: "Part 3",
};

export default function History() {
  const [rows, setRows] = useState<Row[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void supabase
        .from("sim_sessions")
        .select("id, mode, status, created_at, sim_evaluations(band_scores)")
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data }) => {
          if (!cancelled && data) setRows(data as unknown as Row[]);
        });
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "History" }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ gap: 10 }}
        ListEmptyComponent={<Text style={styles.muted}>No sessions yet.</Text>}
        renderItem={({ item }) => {
          const evaluation = Array.isArray(item.sim_evaluations)
            ? item.sim_evaluations[0]
            : item.sim_evaluations;
          const overall = evaluation?.band_scores?.overall;
          return (
            <Link href={`/report/${item.id}`} asChild>
              <Pressable style={styles.row}>
                <Text style={styles.mode}>
                  {MODE_LABELS[item.mode] ?? item.mode}
                  <Text style={styles.date}>  {new Date(item.created_at).toLocaleDateString()}</Text>
                </Text>
                <Text style={styles.band}>
                  {item.status === "scored" && overall !== undefined
                    ? `Band ${overall.toFixed(1)}`
                    : item.status}
                </Text>
              </Pressable>
            </Link>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderWidth: 1, borderColor: "#334155", borderRadius: 12, padding: 14,
  },
  mode: { color: "#f1f5f9" },
  date: { color: "#64748b", fontSize: 12 },
  band: { color: "#818cf8", fontWeight: "600" },
  muted: { color: "#64748b", textAlign: "center", marginTop: 40 },
});
