import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, Stack, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase";
import { SIM_MONTHLY_UNITS, UNIT_COSTS } from "@/src/lib/config";
import type { SimMode } from "@/src/lib/types";
import { ONBOARDING_KEY, Onboarding } from "@/src/components/onboarding";
import { overline, theme } from "@/src/lib/theme";

const MODES: { mode: SimMode; numeral: string; title: string; blurb: string; tip: string }[] = [
  {
    mode: "full", numeral: "I–III", title: "Full exam",
    blurb: "Parts 1–3 · 11–14 minutes · complete band report",
    tip: "Treat it like the real thing — quiet room, full sentences.",
  },
  {
    mode: "part1", numeral: "I", title: "Part 1 practice",
    blurb: "Interview questions on familiar topics",
    tip: "Aim for 2–4 sentences per answer, not one-liners.",
  },
  {
    mode: "part2", numeral: "II", title: "Part 2 practice",
    blurb: "Cue card · 1 min prep · 2 min talk",
    tip: "Use the notes pad — cover every bullet on the card.",
  },
  {
    mode: "part3", numeral: "III", title: "Part 3 practice",
    blurb: "Abstract discussion questions",
    tip: "Give opinions with reasons — 'because' is your friend.",
  },
];

function currentMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default function Home() {
  const [unitsLine, setUnitsLine] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      if (!done) setShowOnboarding(true);
    });
  }, []);

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
        const limit = SIM_MONTHLY_UNITS[(profile?.tier as string) ?? "free"];
        setUnitsLine(
          limit === null
            ? "Unlimited sessions"
            : `${Math.max(0, (limit ?? 0) - (usage?.units ?? 0))} of ${limit ?? 0} units left this month`
        );
      })();
      return () => { cancelled = true; };
    }, [])
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1B2140", theme.bg]}
        locations={[0, 0.42]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Stack.Screen options={{ title: "", headerShown: false }} />
      <Onboarding visible={showOnboarding} onDone={() => setShowOnboarding(false)} />

      <View style={styles.masthead}>
        <Text style={overline}>The Speaking Test</Text>
        <Text style={styles.wordmark}>IELTS Speaking</Text>
        <View style={styles.mastheadRule} />
        <View style={styles.topRow}>
          <Text style={styles.units}>{unitsLine}</Text>
          <View style={styles.topLinks}>
            <Pressable onPress={() => setShowOnboarding(true)}>
              <Text style={styles.link}>How it works</Text>
            </Pressable>
            <Link href="/drills" style={styles.link}>Drills</Link>
            <Link href="/history" style={styles.link}>History</Link>
          </View>
        </View>
      </View>

      <FlatList
        data={MODES}
        keyExtractor={(m) => m.mode}
        contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <Link href={`/exam/${item.mode}`} asChild>
            <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
              <Text style={styles.numeral}>{item.numeral}</Text>
              <View style={styles.cardBody}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cost}>
                    {UNIT_COSTS[item.mode]} unit{UNIT_COSTS[item.mode] > 1 ? "s" : ""}
                  </Text>
                </View>
                <Text style={styles.blurb}>{item.blurb}</Text>
                <Text style={styles.tip}>{item.tip}</Text>
              </View>
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
  container: { flex: 1, padding: 20, paddingTop: 72, gap: 20 },
  masthead: { gap: 8 },
  wordmark: { fontFamily: theme.fontDisplayBold, fontSize: 34, color: theme.ink },
  mastheadRule: { height: 1, backgroundColor: theme.border, marginVertical: 6 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topLinks: { flexDirection: "row", gap: 18 },
  units: { color: theme.brass, fontSize: 13 },
  link: { color: theme.info, fontSize: 13 },
  card: {
    flexDirection: "row", gap: 14, borderWidth: 1, borderColor: theme.border,
    backgroundColor: theme.card, borderRadius: 12, padding: 16,
  },
  cardPressed: { transform: [{ scale: 0.98 }], borderColor: theme.brass },
  numeral: {
    fontFamily: theme.fontDisplayBold, fontSize: 20, color: theme.brass,
    width: 44, textAlign: "center", paddingTop: 2,
  },
  cardBody: { flex: 1, gap: 5 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  cardTitle: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 18 },
  cost: { fontFamily: theme.fontMono, color: theme.inkMuted, fontSize: 11 },
  blurb: { color: theme.inkSecondary, fontSize: 13.5, lineHeight: 19 },
  tip: { color: theme.inkMuted, fontSize: 12.5, lineHeight: 18, fontStyle: "italic" },
  signOut: { color: theme.inkMuted, textAlign: "center", padding: 8, fontSize: 13 },
});
