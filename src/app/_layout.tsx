import { useEffect, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();

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

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0f172a" },
        headerTintColor: "#f1f5f9",
        contentStyle: { backgroundColor: "#0f172a" },
      }}
    />
  );
}
