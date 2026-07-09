import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookOpen, History, House, Target, type LucideIcon } from "lucide-react-native";
import { theme } from "@/src/lib/theme";

export interface HallTab {
  key: string;
  name: string;
  label: string;
}

/** Lucide icon per tab, named by the tab's job (approach borrowed from the
 *  clinic-wellness app's tab bar). */
const ICONS: Record<string, LucideIcon> = {
  index: House,
  history: History,
  drills: Target,
  phrasebook: BookOpen,
};

/** Custom bottom tab bar for the Tabs navigator: lucide icon over a mono label,
 *  brass when active, on the examination-hall ink surface. The Tabs navigator
 *  keeps scenes mounted (instant switching); we own every pixel of the bar so
 *  it never inherits the navigator's default light theme. */
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
        const Icon = ICONS[tab.name] ?? House;
        const color = on ? theme.brass : theme.inkMuted;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => { if (!on) onSelect(tab.name); }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <Icon size={22} color={color} strokeWidth={on ? 2.2 : 1.7} />
            <Text numberOfLines={1} style={[styles.label, { color }]}>
              {tab.label}
            </Text>
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
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 2 },
  label: { fontFamily: theme.fontMono, fontSize: 10, letterSpacing: 0.2 },
});
