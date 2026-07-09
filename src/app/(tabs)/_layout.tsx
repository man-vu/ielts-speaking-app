import { Tabs } from "expo-router";
import { HallTabBar } from "@/src/components/hall-tab-bar";
import { theme } from "@/src/lib/theme";

const LABELS: Record<string, string> = {
  index: "Home",
  history: "History",
  drills: "Drills",
  phrasebook: "Phrasebook",
};

/** The four main screens live under this Tabs navigator: it keeps them mounted
 *  so switching is instant (no stack push/re-mount), while HallTabBar owns the
 *  bar's look. Scene background is opaque ink so an unstyled frame degrades to
 *  dark, never white; each screen still paints its own HallBackdrop. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.bg } }}
      tabBar={({ state, navigation }) => (
        <HallTabBar
          tabs={state.routes.map((r) => ({
            key: r.key,
            name: r.name,
            label: LABELS[r.name] ?? r.name,
          }))}
          activeIndex={state.index}
          onSelect={(name) => navigation.navigate(name)}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="drills" />
      <Tabs.Screen name="phrasebook" />
    </Tabs>
  );
}
