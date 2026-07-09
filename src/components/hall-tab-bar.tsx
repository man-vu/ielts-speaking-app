import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/lib/theme";

export interface HallTab {
  key: string;
  name: string;
  label: string;
}

/** Custom bottom tab bar for the Tabs navigator. A hand-rendered View/Pressable
 *  bar — the Tabs navigator manages the (mounted, instant-switching) scenes, we
 *  own every pixel of the bar so it wears the examination-hall look and never
 *  inherits the navigator's default light theme. */
export function HallTabBar({
  tabs,
  activeIndex,
  onSelect,
}: {
  tabs: HallTab[];
  activeIndex: number;
  onSelect: (name: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {tabs.map((tab, index) => {
        const on = index === activeIndex;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => { if (!on) onSelect(tab.name); }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <View style={[styles.pill, on && styles.pillOn]}>
              <Text numberOfLines={1} style={[styles.label, on && styles.labelOn]}>
                {tab.label}
              </Text>
            </View>
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
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: "center" },
  pill: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9 },
  pillOn: { backgroundColor: "rgba(201, 163, 92, 0.14)" },
  label: {
    fontFamily: theme.fontMono,
    fontSize: 11.5,
    letterSpacing: 0.2,
    color: theme.inkMuted,
  },
  labelOn: { color: theme.brass },
});
