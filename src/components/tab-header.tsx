import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountMenu } from "@/src/components/account-menu";
import { theme } from "@/src/lib/theme";

/** Top bar for tab screens: an optional screen title on the left, the account
 *  avatar on the right. Also owns the top safe-area inset so screen content
 *  flows cleanly beneath it (the tab screens have no navigator header). */
export function TabHeader({ title }: { title?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      {title ? <Text style={styles.title}>{title}</Text> : <View />}
      <AccountMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: { fontFamily: theme.fontDisplay, fontSize: 22, color: theme.ink },
});
