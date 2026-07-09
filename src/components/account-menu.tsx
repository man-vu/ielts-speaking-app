import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import { SIM_MONTHLY_UNITS } from "@/src/lib/config";
import { overline, theme } from "@/src/lib/theme";

function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  ai_pro: "AI Pro",
  pro: "Pro",
};

/** The account entry point: a top-right avatar that opens a small sheet with
 *  plan, remaining units, and sign out. Rendered in-flow inside TabHeader; the
 *  sheet is a full-screen modal anchored under the avatar. */
export function AccountMenu() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("free");
  const [unitsLine, setUnitsLine] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setEmail(user.email ?? "");
      const [{ data: profile }, { data: usage }] = await Promise.all([
        supabase.from("profiles").select("tier").eq("id", user.id).maybeSingle(),
        supabase
          .from("sim_usage")
          .select("units")
          .eq("user_id", user.id)
          .eq("month_start", monthStart())
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const t = (profile?.tier as string) ?? "free";
      setTier(t);
      const limit = SIM_MONTHLY_UNITS[t];
      setUnitsLine(
        limit === null
          ? "Unlimited sessions"
          : `${Math.max(0, (limit ?? 0) - (usage?.units ?? 0))} of ${limit ?? 0} units left this month`
      );
    })();
    return () => { cancelled = true; };
  }, []);

  const initial = (email.trim()[0] ?? "?").toUpperCase();

  return (
    <>
      <Pressable
        style={styles.avatar}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Account"
        hitSlop={8}
      >
        <Text style={styles.avatarText}>{initial}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          {/* Empty onPress absorbs taps so touching the sheet doesn't dismiss it. */}
          <Pressable style={[styles.sheet, { top: insets.top + 48 }]} onPress={() => {}}>
            <Text style={[overline, styles.sheetLabel]}>Account</Text>
            {email ? (
              <Text style={styles.email} numberOfLines={1}>
                {email}
              </Text>
            ) : null}
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Plan</Text>
              <Text style={styles.rowValue}>{TIER_LABELS[tier] ?? tier}</Text>
            </View>
            {unitsLine ? <Text style={styles.units}>{unitsLine}</Text> : null}
            <Pressable
              style={styles.signOut}
              onPress={() => {
                setOpen(false);
                void supabase.auth.signOut();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.brass,
    backgroundColor: theme.cardRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: theme.fontDisplay,
    fontSize: 17,
    color: theme.brass,
  },
  scrim: { flex: 1, backgroundColor: "rgba(8, 10, 20, 0.55)" },
  sheet: {
    position: "absolute",
    right: 16,
    width: 250,
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
  },
  sheetLabel: { color: theme.inkMuted },
  email: { color: theme.ink, fontSize: 13.5 },
  divider: { height: 1, backgroundColor: theme.borderSoft, marginVertical: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel: { color: theme.inkSecondary, fontSize: 13.5 },
  rowValue: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 14.5 },
  units: { color: theme.brass, fontSize: 12.5 },
  signOut: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.borderSoft,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  signOutText: { color: theme.stampRed, fontSize: 13.5 },
});
