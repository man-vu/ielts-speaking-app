import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { supabase } from "@/src/lib/supabase";
import { Loading } from "@/src/components/loading";
import { HallBackdrop } from "@/src/components/hall-backdrop";
import { TabHeader } from "@/src/components/tab-header";
import {
  deriveQuestion, type DialogueTurn, type TopicPayload,
} from "@/src/lib/phrasebook-questions";
import { overline, theme } from "@/src/lib/theme";

const LEARNED_KEY = "phrasebook-learned-v1";

interface Entry {
  wrong: string;
  right: string;
  type: string;
  part?: number;
  question: string | null;
}

interface SessionRef {
  dialogue: DialogueTurn[] | null;
  topic_payload: TopicPayload | null;
}
interface EvalRow {
  created_at: string;
  priority_errors:
    | { error_type: string; description: string; correction: string; quote?: string; part?: number }[]
    | null;
  sim_sessions: SessionRef | SessionRef[] | null;
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
            .select("created_at, priority_errors, sim_sessions(dialogue, topic_payload)")
            .order("created_at", { ascending: false })
            .limit(30),
          AsyncStorage.getItem(LEARNED_KEY),
        ]);
        if (cancelled) return;
        const seen = new Set<string>();
        const flat: Entry[] = [];
        for (const row of (data ?? []) as EvalRow[]) {
          const sess = Array.isArray(row.sim_sessions) ? row.sim_sessions[0] : row.sim_sessions;
          for (const e of row.priority_errors ?? []) {
            const wrong = (e.quote ?? "").trim() || e.description;
            const key = `${wrong}→${e.correction}`;
            if (!wrong || !e.correction || seen.has(key)) continue;
            seen.add(key);
            flat.push({
              wrong, right: e.correction, type: e.error_type, part: e.part,
              question: deriveQuestion(e, sess ?? null),
            });
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
      <TabHeader title="Phrasebook" />
      <FlatList
        style={styles.list}
        data={entries}
        keyExtractor={(e) => `${e.wrong}→${e.right}`}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 24 }}
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
              {item.question ? (
                <Text style={styles.question} numberOfLines={2}>
                  {item.part ? <Text style={styles.questionPart}>Part {item.part} · </Text> : null}
                  {item.question}
                </Text>
              ) : item.part ? (
                <Text style={[styles.question, styles.questionPart]}>Part {item.part}</Text>
              ) : null}
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
  container: { flex: 1 },
  list: { flex: 1 },
  intro: { color: theme.inkMuted, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  card: {
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card,
    borderRadius: 12, padding: 14, gap: 4,
  },
  cardLearned: { opacity: 0.45 },
  question: { color: theme.inkSecondary, fontSize: 12.5, lineHeight: 17, fontStyle: "italic" },
  questionPart: { color: theme.brass, fontStyle: "normal", fontFamily: theme.fontMono, fontSize: 11 },
  type: { color: theme.inkMuted, fontSize: 10 },
  wrong: {
    color: theme.stampRed, fontSize: 14.5, lineHeight: 21,
    textDecorationLine: "line-through", textDecorationColor: theme.stampRed,
  },
  right: { color: theme.live, fontSize: 14.5, lineHeight: 21 },
  muted: { color: theme.inkMuted, textAlign: "center", marginTop: 40, lineHeight: 20 },
});
