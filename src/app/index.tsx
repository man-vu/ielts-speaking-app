import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, Stack, useFocusEffect } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { SIM_MONTHLY_UNITS, UNIT_COSTS } from "@/src/lib/config";
import type { SimMode } from "@/src/lib/types";

const MODES: { mode: SimMode; title: string; blurb: string }[] = [
  { mode: "full", title: "Full exam", blurb: "Parts 1–3, 11–14 minutes, complete band report" },
  { mode: "part1", title: "Part 1 practice", blurb: "Interview questions on familiar topics" },
  { mode: "part2", title: "Part 2 practice", blurb: "Cue card, 1 min prep, 2 min talk" },
  { mode: "part3", title: "Part 3 practice", blurb: "Abstract discussion questions" },
];

function currentMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default function Home() {
  const [unitsLine, setUnitsLine] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data: profile }, { data: usage }] = await Promise.all([
          supabase.from("profiles").select("tier").eq("id", user.id).maybeSingle(),
          supabase.from("sim_usage").select("units").eq("user_id", user.id)
            .eq("month_start", currentMonthStart()).maybeSingle(),
        ]);
        if (cancelled) return;
        const limit = SIM_MONTHLY_UNITS[(profile?.tier as string) ?? "free"] ?? 0;
        setUnitsLine(
          limit === null
            ? "Unlimited sessions"
            : `${Math.max(0, limit - (usage?.units ?? 0))} of ${limit} units left this month`
        );
      })();
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "IELTS Speaking" }} />
      <View style={styles.topRow}>
        <Text style={styles.units}>{unitsLine}</Text>
        <Link href="/history" style={styles.link}>History</Link>
      </View>
      <FlatList
        data={MODES}
        keyExtractor={(m) => m.mode}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <Link href={`/exam/${item.mode}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cost}>
                  {UNIT_COSTS[item.mode]} unit{UNIT_COSTS[item.mode] > 1 ? "s" : ""}
                </Text>
              </View>
              <Text style={styles.blurb}>{item.blurb}</Text>
            </Pressable>
          </Link>
        )}
      />
      <Pressable onPress={() => void supabase.auth.signOut()}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  units: { color: "#34d399" },
  link: { color: "#818cf8" },
  card: { borderWidth: 1, borderColor: "#334155", borderRadius: 12, padding: 16, gap: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  cardTitle: { color: "#f1f5f9", fontSize: 17, fontWeight: "600" },
  cost: { color: "#64748b", fontSize: 12 },
  blurb: { color: "#94a3b8", fontSize: 13 },
  signOut: { color: "#64748b", textAlign: "center", padding: 8 },
});
