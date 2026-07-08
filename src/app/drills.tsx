import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { supabase } from "@/src/lib/supabase";
import { track } from "@/src/lib/telemetry";
import { Loading } from "@/src/components/loading";
import { overline, theme } from "@/src/lib/theme";

const DONE_KEY = "drills-done-v1";
const RESURFACE_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // done drills return after 3 days

interface Drill {
  drill_name: string;
  target_error: string;
  instruction: string;
  fromDate: string;
}

/** Practice drills harvested from the user's scored reports — every report
 *  generates up to 4, but until now they vanished after one reading. A
 *  lightweight resurface rhythm (done → hidden 3 days → back) turns them
 *  into a retention loop without any backend. */
export default function Drills() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [doneMap, setDoneMap] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [{ data }, doneRaw] = await Promise.all([
          supabase
            .from("sim_evaluations")
            .select("drill_queue, created_at")
            .order("created_at", { ascending: false })
            .limit(15),
          AsyncStorage.getItem(DONE_KEY),
        ]);
        if (cancelled) return;
        const done = doneRaw ? (JSON.parse(doneRaw) as Record<string, number>) : {};
        const seen = new Set<string>();
        const flat: Drill[] = [];
        for (const row of data ?? []) {
          const queue = (row.drill_queue ?? []) as Omit<Drill, "fromDate">[];
          for (const d of queue) {
            if (seen.has(d.drill_name)) continue;
            seen.add(d.drill_name);
            flat.push({ ...d, fromDate: row.created_at as string });
          }
        }
        setDoneMap(done);
        setDrills(flat);
        setLoaded(true);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  async function markDone(name: string) {
    void Haptics.selectionAsync().catch(() => {});
    track("drill_done", { drill: name });
    const next = { ...doneMap, [name]: Date.now() };
    setDoneMap(next);
    await AsyncStorage.setItem(DONE_KEY, JSON.stringify(next)).catch(() => {});
  }

  const now = Date.now();
  const due = drills.filter((d) => {
    const doneAt = doneMap[d.drill_name];
    return !doneAt || now - doneAt > RESURFACE_AFTER_MS;
  });
  const resting = drills.length - due.length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Practice drills" }} />
      <FlatList
        data={due}
        keyExtractor={(d) => d.drill_name}
        contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
        ListHeaderComponent={
          due.length > 0 ? (
            <Text style={styles.intro}>
              From your examiner's reports. Say each drill aloud a few times,
              then mark it done — it returns in three days to check it stuck.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loaded ? (
            <Loading label="Preparing your drills…" />
          ) : (
            <Text style={styles.muted}>
              {drills.length === 0
                ? "Finish a scored session and your personalised drills will appear here."
                : `All caught up — ${resting} drill${resting === 1 ? "" : "s"} resting until their next round.`}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={[overline, styles.target]}>{item.target_error}</Text>
            <Text style={styles.name}>{item.drill_name}</Text>
            <Text style={styles.instruction}>{item.instruction}</Text>
            <Pressable style={styles.doneButton} onPress={() => void markDone(item.drill_name)}>
              <Text style={styles.doneText}>Done — resurface in 3 days</Text>
            </Pressable>
          </View>
        )}
      />
      {resting > 0 && due.length > 0 && (
        <Text style={styles.restingLine}>
          {resting} more resting until their next round
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  intro: { color: theme.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  card: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 16, gap: 6,
  },
  target: { color: theme.stampRed, fontSize: 10 },
  name: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 17 },
  instruction: { color: theme.inkSecondary, fontSize: 14, lineHeight: 21 },
  doneButton: {
    alignSelf: "flex-start", marginTop: 6, borderWidth: 1, borderColor: theme.borderSoft,
    borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14,
  },
  doneText: { color: theme.live, fontSize: 12.5 },
  muted: { color: theme.inkMuted, textAlign: "center", marginTop: 40, lineHeight: 20 },
  restingLine: { color: theme.inkMuted, fontSize: 12, textAlign: "center", paddingVertical: 8 },
});
