import { useEffect, useState } from "react";
import {
  Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Stack, router } from "expo-router";
import * as Haptics from "expo-haptics";
import type { PurchasesPackage } from "react-native-purchases";
import { HallBackdrop } from "@/src/components/hall-backdrop";
import { supabase } from "@/src/lib/supabase";
import {
  getPlanPackages, purchasePlan, purchasesAvailable, restorePurchases,
  type PlanKey,
} from "@/src/lib/purchases";
import { track } from "@/src/lib/telemetry";
import { overline, theme } from "@/src/lib/theme";

const PLANS: {
  key: PlanKey;
  name: string;
  fallbackPrice: string;
  exams: string;
  featured?: boolean;
}[] = [
  { key: "ai_plus", name: "AI Plus", fallbackPrice: "$9.99", exams: "12 units — 4 full mock exams a month" },
  { key: "ai_pro", name: "AI Pro", fallbackPrice: "$19.99", exams: "36 units — 12 full mock exams a month", featured: true },
];

const FEATURES = [
  "Live AI examiner — full three-part exams, single parts, or casual chat",
  "Band scores on the four official criteria, matched line-by-line against the official descriptors",
  "Tap-to-fix mistake highlighting in every transcript",
  "Your own answers rewritten and voiced at Band 8",
  "Four examiner temperaments and real past-paper topics",
];

const TIER_LABELS: Record<string, string> = {
  ai_plus: "AI Plus", ai_pro: "AI Pro", admin: "Admin",
};
const PAID_RANK: Record<string, number> = { ai_plus: 1, ai_pro: 2, admin: 3 };

const MANAGE_URL = "https://apps.apple.com/account/subscriptions";
const EULA_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_URL = "https://ielts-speaking-simulator-mauve.vercel.app/privacy";

async function currentTier(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "free";
  const { data: profile } = await supabase
    .from("profiles").select("tier").eq("id", user.id).maybeSingle();
  return (profile?.tier as string) ?? "free";
}

/** The purchase webhook usually lands within seconds; poll briefly so the
 *  screen can confirm the new plan instead of asking the user to trust us. */
async function waitForPaidTier(timeoutMs = 20_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tier = await currentTier();
    if (PAID_RANK[tier]) return tier;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

export default function Paywall() {
  const [tier, setTier] = useState("");
  const [selected, setSelected] = useState<PlanKey>("ai_pro");
  const [packages, setPackages] = useState<Record<PlanKey, PurchasesPackage | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void currentTier().then((t) => { if (!cancelled) setTier(t); });
    void getPlanPackages().then((p) => { if (!cancelled) setPackages(p); });
    return () => { cancelled = true; };
  }, []);

  const priceFor = (plan: (typeof PLANS)[number]) =>
    packages?.[plan.key]?.product.priceString ?? plan.fallbackPrice;

  const subscribed = !!PAID_RANK[tier];

  function explainUnavailable() {
    Alert.alert(
      "Purchases not available yet",
      Platform.OS === "ios"
        ? "This build can't reach the App Store's payment system. Install the TestFlight/App Store version to subscribe."
        : "Subscriptions are handled through the iOS app for now. Sign in with the same account there to subscribe."
    );
  }

  function buy() {
    const pkg = packages?.[selected] ?? null;
    if (!purchasesAvailable() || !pkg) return explainUnavailable();
    if (busy) return;
    setBusy(true);
    track("paywall_purchase_tapped", { plan: selected });
    void purchasePlan(pkg)
      .then(async (outcome) => {
        if (outcome.status === "cancelled") return;
        if (outcome.status === "error") {
          Alert.alert("Purchase failed", outcome.message ?? "");
          return;
        }
        const newTier = await waitForPaidTier();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        track("paywall_purchased", { plan: selected });
        if (newTier) setTier(newTier);
        Alert.alert(
          "Welcome aboard",
          newTier
            ? `You're on ${TIER_LABELS[newTier] ?? newTier}. Your units are ready — good luck in there.`
            : "Purchase complete. Your plan can take a minute to activate.",
          [{ text: "Start practising", onPress: () => router.back() }]
        );
      })
      .finally(() => setBusy(false));
  }

  function restore() {
    if (restoring) return;
    if (!purchasesAvailable()) return explainUnavailable();
    setRestoring(true);
    void restorePurchases()
      .then(async (info) => {
        const active = Object.keys(info?.entitlements.active ?? {});
        if (active.length === 0) {
          Alert.alert("Nothing to restore", "No active subscription was found for this Apple ID.");
          return;
        }
        const newTier = await waitForPaidTier(10_000);
        if (newTier) setTier(newTier);
        Alert.alert("Restored", "Your subscription is active again.");
      })
      .finally(() => setRestoring(false));
  }

  return (
    <View style={{ flex: 1 }}>
      <HallBackdrop />
      <Stack.Screen options={{ title: "Membership" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={overline}>Membership</Text>
        <Text style={styles.title}>Practise like it counts</Text>
        <Text style={styles.intro}>
          Every session is a full-pressure rehearsal: a live examiner, real
          past-paper questions, and a report that shows exactly what stands
          between you and your target band.
        </Text>

        {subscribed && (
          <View style={styles.currentBox}>
            <Text style={styles.currentText}>
              You're on {TIER_LABELS[tier] ?? tier}.
            </Text>
            {Platform.OS === "ios" && (
              <Pressable
                onPress={() => void Linking.openURL(MANAGE_URL)}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.link}>Manage or cancel in the App Store</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.plans}>
          {PLANS.map((plan) => {
            const on = selected === plan.key;
            return (
              <Pressable
                key={plan.key}
                style={[styles.plan, on && styles.planOn]}
                onPress={() => setSelected(plan.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                {plan.featured && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Most popular</Text>
                  </View>
                )}
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>{priceFor(plan)}</Text>
                  <Text style={styles.priceUnit}>/ month</Text>
                </View>
                <Text style={styles.planExams}>{plan.exams}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.featureMark}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={[styles.cta, busy && { opacity: 0.6 }]}
          onPress={buy}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>
            {busy
              ? "Completing your purchase…"
              : `Subscribe — ${priceFor(PLANS.find((p) => p.key === selected) ?? PLANS[0])}/month`}
          </Text>
        </Pressable>

        <Pressable onPress={restore} disabled={restoring} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.restore, restoring && { opacity: 0.5 }]}>
            {restoring ? "Restoring…" : "Restore purchases"}
          </Text>
        </Pressable>

        <Text style={styles.legal}>
          Payment is charged to your Apple ID at confirmation. The subscription
          renews monthly at the same price unless cancelled at least 24 hours
          before the end of the period — manage or cancel any time in your App
          Store account settings. Unused units don't roll over.
        </Text>
        <View style={styles.legalLinks}>
          <Pressable onPress={() => void Linking.openURL(EULA_URL)} hitSlop={8}>
            <Text style={styles.link}>Terms of Use</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={8}>
            <Text style={styles.link}>Privacy Policy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 40, gap: 14 },
  title: { fontFamily: theme.fontDisplayBold, fontSize: 30, color: theme.ink },
  intro: { fontSize: 14, lineHeight: 21, color: theme.inkSecondary },
  currentBox: {
    borderWidth: 1, borderColor: "rgba(201, 163, 92, 0.4)", borderRadius: 12,
    padding: 13, gap: 6, backgroundColor: "rgba(201, 163, 92, 0.07)",
  },
  currentText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 14.5 },
  plans: { flexDirection: "row", gap: 10, marginTop: 4 },
  plan: {
    flex: 1, gap: 4, padding: 15, borderRadius: 14, borderWidth: 1,
    borderColor: theme.border, backgroundColor: theme.card,
  },
  planOn: { borderColor: theme.brass, backgroundColor: "rgba(201, 163, 92, 0.1)" },
  badge: {
    alignSelf: "flex-start", borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7,
    backgroundColor: theme.brass, marginBottom: 3,
  },
  badgeText: {
    fontFamily: theme.fontMono, fontSize: 9.5, letterSpacing: 0.6,
    textTransform: "uppercase", color: theme.bg,
  },
  planName: { fontFamily: theme.fontDisplay, fontSize: 17, color: theme.ink },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  price: {
    fontFamily: theme.fontDisplayBold, fontSize: 24, color: theme.ink,
    fontVariant: ["tabular-nums"],
  },
  priceUnit: { fontFamily: theme.fontMono, fontSize: 11, color: theme.inkMuted },
  planExams: { fontSize: 12, lineHeight: 17, color: theme.inkSecondary },
  features: { gap: 8, marginTop: 4 },
  featureRow: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  featureMark: { fontFamily: theme.fontMono, fontSize: 12, lineHeight: 19, color: theme.live },
  featureText: { flex: 1, fontSize: 13, lineHeight: 19, color: theme.inkSecondary },
  cta: {
    backgroundColor: theme.brass, borderRadius: 12, paddingVertical: 15,
    alignItems: "center", marginTop: 6,
  },
  ctaText: { fontFamily: theme.fontDisplay, fontSize: 16, color: theme.bg },
  restore: { textAlign: "center", color: theme.info, fontSize: 13.5, paddingVertical: 4 },
  legal: { fontSize: 11, lineHeight: 16, color: theme.inkMuted, marginTop: 6 },
  legalLinks: {
    flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center",
  },
  legalDot: { color: theme.inkMuted },
  link: { color: theme.info, fontSize: 12.5 },
});
