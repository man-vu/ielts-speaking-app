import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAV_TABS, activeTab } from "@/src/lib/nav";
import { theme } from "@/src/lib/theme";

/** Examination-hall bottom navigation. A plain View/Pressable bar — NOT an
 *  expo-router Tabs navigator — because this SDK's navigator theming has
 *  repeatedly painted white backgrounds on device; a hand-rendered bar shares
 *  the same reliable render path as every other screen. Rendered only on the
 *  four tab destinations; exam/report/sign-in stay full-screen. */
export function BottomNav() {
  const insets = useSafeAreaInsets();
  const active = activeTab(usePathname());
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {NAV_TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            style={styles.tab}
            onPress={() => {
              // navigate (not push) dedupes to an existing screen in the
              // stack, so switching tabs never builds an infinite back stack.
              if (!on) router.navigate(t.href);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            hitSlop={6}
          >
            <View style={[styles.pip, on && styles.pipOn]} />
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: theme.card,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 9,
  },
  tab: { flex: 1, alignItems: "center", gap: 5 },
  pip: { width: 20, height: 2, borderRadius: 1, backgroundColor: "transparent" },
  pipOn: { backgroundColor: theme.brass },
  label: {
    fontFamily: theme.fontMono,
    fontSize: 11,
    letterSpacing: 0.3,
    color: theme.inkMuted,
  },
  labelOn: { color: theme.brass },
});
