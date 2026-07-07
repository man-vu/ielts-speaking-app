import { useEffect, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
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
import { theme } from "@/src/lib/theme";

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

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.ink,
        headerTitleStyle: { fontFamily: theme.fontDisplay, fontSize: 19 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    />
  );
}
