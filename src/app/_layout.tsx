import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, router, useSegments, type ErrorBoundaryProps } from "expo-router";
import { useFonts } from "expo-font";
import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from "@expo-google-fonts/fraunces";
import {
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";
import { initCrashReporting, reportError } from "@/src/lib/telemetry";
import { flushPreviousSession, installCrashCrumbs, logCrumb } from "@/src/lib/debug-log";
import { overline, theme } from "@/src/lib/theme";

initCrashReporting();
installCrashCrumbs();
logCrumb("app_launch");

// Respect Dynamic Type up to 1.25× but no further — beyond that, fixed exam
// layouts (numeral columns, timer rows, unit chips) shatter. Verified against
// a device screenshot at a large accessibility text size.
type WithDefaultProps = { defaultProps?: { maxFontSizeMultiplier?: number } };
(Text as unknown as WithDefaultProps).defaultProps = {
  ...(Text as unknown as WithDefaultProps).defaultProps,
  maxFontSizeMultiplier: 1.25,
};
(TextInput as unknown as WithDefaultProps).defaultProps = {
  ...(TextInput as unknown as WithDefaultProps).defaultProps,
  maxFontSizeMultiplier: 1.25,
};

/** Themed last-resort screen for uncaught render errors — reported to crash
 *  telemetry (when enabled) with a way back instead of a white screen. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <View style={errorStyles.container}>
      <Text style={overline}>Unexpected interruption</Text>
      <Text style={errorStyles.title}>Something went wrong</Text>
      <Text style={errorStyles.body}>
        The error has been noted. Your completed exam parts are safe — scored
        sessions are always available from History.
      </Text>
      <Pressable
        style={errorStyles.button}
        accessibilityRole="button"
        onPress={() => void retry()}
      >
        <Text style={errorStyles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: "center", padding: 28, gap: 12, backgroundColor: theme.bg,
  },
  title: { fontFamily: theme.fontDisplayBold, fontSize: 28, color: theme.ink },
  body: { color: theme.inkSecondary, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  button: {
    alignSelf: "flex-start", backgroundColor: theme.brass, borderRadius: 10,
    paddingVertical: 13, paddingHorizontal: 26,
  },
  buttonText: { fontFamily: theme.fontDisplay, fontSize: 15, color: theme.bg },
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      // Previous session's flight-recorder trail uploads once we know who
      // the user is — this is what makes crashes debuggable without a cable.
      void flushPreviousSession();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const onSignIn = segments[0] === "sign-in";
    if (!session && !onSignIn) router.replace("/sign-in");
    if (session && onSignIn) router.replace("/");
  }, [ready, session, segments]);

  // Hold the frame until fonts + auth state exist — prevents both the
  // unstyled-text flash and the protected-content flash for signed-out users.
  if (!fontsLoaded || !ready) return null;

  // NOTE: no navigator-level backdrop is possible here — SDK 56 expo-router
  // bans @react-navigation/native imports (ThemeProvider) and paints screens
  // itself. Each screen renders <HallBackdrop /> instead; contentStyle stays
  // opaque ink so an unwrapped screen degrades to flat dark, never white.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#1B2242" },
        headerTintColor: theme.ink,
        headerTitleStyle: { fontFamily: theme.fontDisplay, fontSize: 19 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  );
}
