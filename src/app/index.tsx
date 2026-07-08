import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, Stack, router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase";
import { SIM_MONTHLY_UNITS, UNIT_COSTS } from "@/src/lib/config";
import type { SimMode } from "@/src/lib/types";
import { ONBOARDING_KEY, Onboarding } from "@/src/components/onboarding";
import { apiFetch } from "@/src/lib/api";
import {
  clearPendingExam, getPendingExam, salvagePendingExam, type PendingExamMeta,
} from "@/src/lib/exam/recovery";
import { ExaminerBadge } from "@/src/components/exam-stage";
import { Skeleton } from "@/src/components/skeleton";
import { overline, theme } from "@/src/lib/theme";

const PARTS = [
  { num: "01", name: "Interview", detail: "Familiar topics · 4–5 min" },
  { num: "02", name: "Long turn", detail: "Cue card · 3–4 min" },
  { num: "03", name: "Discussion", detail: "Abstract ideas · 4–5 min" },
];

const PRACTICE: { mode: SimMode; numeral: string; name: string }[] = [
  { mode: "part1", numeral: "I", name: "Interview" },
  { mode: "part2", numeral: "II", name: "Long turn" },
  { mode: "part3", numeral: "III", name: "Discussion" },
];

function currentMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default function Home() {
  const [unitsLine, setUnitsLine] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pending, setPending] = useState<PendingExamMeta | null>(null);
  const [spokeToday, setSpokeToday] = useState<boolean | null>(null);
  const [salvaging, setSalvaging] = useState(false);

  function recoverPending(meta: PendingExamMeta) {
    if (salvaging) return;
    setSalvaging(true);
    salvagePendingExam(meta)
      .then((sessionId) => {
        setPending(null);
        router.push(`/report/${sessionId}`);
      })
      .catch((e: unknown) => {
        Alert.alert(
          "Recovery failed",
          e instanceof Error ? e.message : "Check your connection and try again."
        );
      })
      .finally(() => setSalvaging(false));
  }

  function discardPending(meta: PendingExamMeta) {
    Alert.alert("Discard this recording?", "The unfinished exam's audio will be deleted.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          void apiFetch(`/api/sessions/${meta.sessionId}/abort`, { method: "POST" }).catch(() => {});
          void clearPendingExam();
          setPending(null);
        },
      },
    ]);
  }

  useEffect(() => {
    void AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
      if (!done) setShowOnboarding(true);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getPendingExam().then((meta) => {
        if (!cancelled) setPending(meta);
      });
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [{ data: profile }, { data: usage }, { count: todayCount }] = await Promise.all([
          supabase.from("profiles").select("tier").eq("id", user.id).maybeSingle(),
          supabase.from("sim_usage").select("units").eq("user_id", user.id)
            .eq("month_start", currentMonthStart()).maybeSingle(),
          supabase.from("sim_sessions").select("id", { count: "exact", head: true })
            .eq("user_id", user.id).gte("created_at", todayStart.toISOString()),
        ]);
        if (cancelled) return;
        setSpokeToday((todayCount ?? 0) > 0);
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
    <View style={styles.root}>
      <LinearGradient
        colors={["#1B2140", theme.bg]}
        locations={[0, 0.42]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Stack.Screen options={{ title: "", headerShown: false }} />
      <Onboarding visible={showOnboarding} onDone={() => setShowOnboarding(false)} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeWrap}>
          <ExaminerBadge speaking={false} size={116} />
        </View>

        <View style={styles.masthead}>
          <Text style={overline}>The Speaking Test</Text>
          <Text style={styles.wordmark}>IELTS Speaking</Text>
          <View style={styles.rule} />
        </View>

        <Text style={styles.intro}>
          A face-to-face style assessment in three parts. Your examiner will
          guide you throughout — choose who examines you at the sound check.
        </Text>

        <View style={styles.parts}>
          {PARTS.map((p, i) => (
            <View key={p.num}>
              {i > 0 && <View style={styles.partDivider} />}
              <View style={styles.partRow}>
                <Text style={styles.partNum}>{p.num}</Text>
                <View>
                  <Text style={styles.partName}>{p.name}</Text>
                  <Text style={styles.partDetail}>{p.detail}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={() => router.push("/exam/full")}
            accessibilityRole="button"
            accessibilityLabel={`Begin the full exam. Costs ${UNIT_COSTS.full} units.`}
          >
            <Text style={styles.primaryText}>Begin exam</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            onPress={() => setShowOnboarding(true)}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>How the test works</Text>
          </Pressable>
        </View>

        {pending && (
          <View style={styles.recoveryCard}>
            <Text style={[overline, styles.recoveryLabel]}>Unfinished exam recovered</Text>
            <Text style={styles.recoveryBody}>
              The app closed before scoring, but your recording
              {pending.parts.length > 1 ? "s are" : " is"} safe — Part
              {pending.parts.length > 1 ? "s " : " "}
              {pending.parts.map((p) => p.part).join(", ")},{" "}
              {Math.max(1, Math.round((Date.now() - pending.updatedAt) / 60000))} min ago.
            </Text>
            <View style={styles.recoveryActions}>
              <Pressable
                style={({ pressed }) => [styles.recoveryScore, pressed && styles.pressed]}
                onPress={() => recoverPending(pending)}
                disabled={salvaging}
                accessibilityRole="button"
              >
                <Text style={styles.recoveryScoreText}>
                  {salvaging ? "Uploading…" : "Score it"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => discardPending(pending)}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.recoveryDiscard}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.practiceBlock}>
          <Text style={[overline, styles.practiceLabel]}>Practice a single part</Text>
          <View style={styles.practiceRow}>
            {PRACTICE.map((p) => (
              <Pressable
                key={p.mode}
                style={({ pressed }) => [styles.practiceCard, pressed && styles.practicePressed]}
                onPress={() => router.push(`/exam/${p.mode}`)}
                accessibilityRole="button"
                accessibilityLabel={`Practice ${p.name}. Costs 1 unit.`}
              >
                <Text style={styles.practiceNumeral}>{p.numeral}</Text>
                <Text style={styles.practiceName}>{p.name}</Text>
                <Text style={styles.practiceCost}>1 unit</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {spokeToday !== null && (
          <Text style={[styles.dailyGoal, spokeToday && styles.dailyGoalDone]}>
            {spokeToday
              ? "✓ You've spoken today — the habit holds."
              : "You haven't spoken today. Five minutes counts."}
          </Text>
        )}

        <View style={styles.footer}>
          {unitsLine ? (
            <Text style={styles.units}>{unitsLine}</Text>
          ) : (
            <Skeleton width={150} height={13} radius={6} />
          )}
          <View style={styles.footerLinks}>
            <Link href="/phrasebook" style={styles.link}>Phrasebook</Link>
            <Link href="/drills" style={styles.link}>Drills</Link>
            <Link href="/history" style={styles.link}>History</Link>
            <Pressable onPress={() => void supabase.auth.signOut()} accessibilityRole="button">
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 32, gap: 16 },
  badgeWrap: { alignItems: "center" },
  masthead: { gap: 8 },
  wordmark: { fontFamily: theme.fontDisplayBold, fontSize: 34, color: theme.ink },
  rule: { height: 1, backgroundColor: theme.border, marginTop: 4 },
  intro: { fontSize: 14, lineHeight: 22, color: theme.inkSecondary },
  parts: { gap: 10, marginTop: 2 },
  partRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  partNum: {
    fontFamily: theme.fontMono, fontSize: 12, color: theme.brass,
    minWidth: 22, paddingTop: 2,
  },
  partName: { color: theme.ink, fontSize: 13.5 },
  partDetail: { color: theme.inkMuted, fontSize: 12, marginTop: 1 },
  partDivider: { height: 1, backgroundColor: theme.borderSoft, marginBottom: 10 },
  actions: { gap: 10, marginTop: 6 },
  primary: {
    backgroundColor: theme.brass, borderRadius: 10, padding: 15, alignItems: "center",
  },
  primaryText: { fontFamily: theme.fontDisplay, fontSize: 16, color: theme.bg },
  secondary: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, padding: 15, alignItems: "center",
  },
  secondaryText: { fontFamily: theme.fontDisplay, fontSize: 16, color: theme.ink },
  pressed: { transform: [{ scale: 0.98 }] },
  recoveryCard: {
    marginTop: 8, gap: 8, padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: theme.brass, backgroundColor: theme.cardRaised,
  },
  recoveryLabel: { color: theme.brass },
  recoveryBody: { color: theme.inkSecondary, fontSize: 13.5, lineHeight: 20 },
  recoveryActions: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 4 },
  recoveryScore: {
    backgroundColor: theme.brass, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 22,
  },
  recoveryScoreText: { fontFamily: theme.fontDisplay, fontSize: 14.5, color: theme.bg },
  recoveryDiscard: { color: theme.stampRed, fontSize: 13.5 },
  practiceBlock: { gap: 10, marginTop: 8 },
  practiceLabel: { color: theme.inkMuted },
  practiceRow: { flexDirection: "row", gap: 10 },
  practiceCard: {
    flex: 1, alignItems: "center", gap: 3, paddingVertical: 14,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 12,
  },
  practicePressed: { transform: [{ scale: 0.97 }], borderColor: theme.brass },
  practiceNumeral: { fontFamily: theme.fontDisplayBold, fontSize: 18, color: theme.brass },
  practiceName: { color: theme.ink, fontSize: 12.5 },
  practiceCost: { fontFamily: theme.fontMono, fontSize: 10.5, color: theme.inkMuted },
  dailyGoal: {
    textAlign: "center", fontSize: 12.5, color: theme.inkMuted, marginTop: 10,
  },
  dailyGoalDone: { color: theme.live },
  footer: { gap: 12, marginTop: 14, alignItems: "center" },
  units: { color: theme.brass, fontSize: 13 },
  footerLinks: { flexDirection: "row", gap: 24, alignItems: "center" },
  link: { color: theme.info, fontSize: 13 },
  signOut: { color: theme.inkMuted, fontSize: 13 },
});
