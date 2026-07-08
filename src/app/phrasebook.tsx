import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { supabase } from "@/src/lib/supabase";
import { Loading } from "@/src/components/loading";
import { HallBackdrop } from "@/src/components/hall-backdrop";
import { overline, theme } from "@/src/lib/theme";

const LEARNED_KEY = "phrasebook-learned-v1";

interface Entry {
  wrong: string;
  right: string;
  type: string;
}

interface EvalRow {
  created_at: string;
  priority_errors: { error_type: string; description: string; correction: string; quote?: string }[] | null;
}

/** Kippy-style personal phrasebook, examination-hall edition: every
 *  correction the examiner's reports have ever issued, collected in one
 *  place. Tap to mark learned (kept, dimmed). */
export default function Phrasebook() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [learned, setLearned] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [{ data }, learnedRaw] = await Promise.all([
          supabase
            .from("sim_evaluations")
            .select("created_at, priority_errors")
            .order("created_at", { ascending: false })
            .limit(30),
          AsyncStorage.getItem(LEARNED_KEY),
        ]);
        if (cancelled) return;
        const seen = new Set<string>();
        const flat: Entry[] = [];
        for (const row of (data ?? []) as EvalRow[]) {
          for (const e of row.priority_errors ?? []) {
            const wrong = (e.quote ?? "").trim() || e.description;
            const key = `${wrong}→${e.correction}`;
            if (!wrong || !e.correction || seen.has(key)) continue;
            seen.add(key);
            flat.push({ wrong, right: e.correction, type: e.error_type });
          }
        }
        setLearned(learnedRaw ? (JSON.parse(learnedRaw) as Record<string, boolean>) : {});
        setEntries(flat);
        setLoaded(true);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  function toggle(entry: Entry) {
    const key = `${entry.wrong}→${entry.right}`;
    void Haptics.selectionAsync().catch(() => {});
    setLearned((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      void AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  return (
    <View style={styles.container}>
      <HallBackdrop />
      <Stack.Screen options={{ title: "Phrasebook" }} />
      <FlatList
        data={entries}
        keyExtractor={(e) => `${e.wrong}→${e.right}`}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        ListHeaderComponent={
          entries.length > 0 ? (
            <Text style={styles.intro}>
              Every fix from your reports. Tap one when it's stuck.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          loaded ? (
            <Text style={styles.muted}>
              Finish a scored session and your corrections will collect here.
            </Text>
          ) : (
            <Loading label="Collecting your corrections…" />
          )
        }
        renderItem={({ item }) => {
          const isLearned = learned[`${item.wrong}→${item.right}`];
          return (
            <Pressable
              style={[styles.card, isLearned && styles.cardLearned]}
              onPress={() => toggle(item)}
              accessibilityRole="button"
            >
              <Text style={[overline, styles.type]}>
                {item.type}{isLearned ? " · learned ✓" : ""}
              </Text>
              <Text style={styles.wrong}>{item.wrong}</Text>
              <Text style={styles.right}>✓ {item.right}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  intro: { color: theme.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  card: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 14, gap: 4,
  },
  cardLearned: { opacity: 0.45 },
  type: { color: theme.inkMuted, fontSize: 10 },
  wrong: {
    color: theme.stampRed, fontSize: 14.5, lineHeight: 21,
    textDecorationLine: "line-through", textDecorationColor: theme.stampRed,
  },
  right: { color: theme.live, fontSize: 14.5, lineHeight: 21 },
  muted: { color: theme.inkMuted, textAlign: "center", marginTop: 40, lineHeight: 20 },
});
