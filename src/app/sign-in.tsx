import { useEffect, useState } from "react";
import { router, Stack } from "expo-router";
import {
  KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/src/lib/supabase";
import {
  appleAuthEnabled, AuthCancelled, googleAuthAvailable, signInWithApple, signInWithGoogle,
} from "@/src/lib/social-auth";
import { HallBackdrop } from "@/src/components/hall-backdrop";
import { overline, theme } from "@/src/lib/theme";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Only show the Apple button when the build actually carries the Sign in
  // with Apple entitlement — otherwise tapping it would error. (Also hides it
  // on Android automatically.)
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (!appleAuthEnabled) return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  async function signIn() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/");
  }

  async function social(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.replace("/");
    } catch (e) {
      if (!(e instanceof AuthCancelled)) {
        setError(e instanceof Error ? e.message : "Sign-in failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <HallBackdrop />
      <View style={styles.masthead}>
        <Text style={overline}>The Speaking Test</Text>
        <Text style={styles.wordmark}>IELTS Speaking</Text>
        <View style={styles.rule} />
      </View>
      <Text style={styles.subtitle}>Sign in to sit the exam.</Text>

      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={10}
          style={styles.appleButton}
          onPress={() => void social(signInWithApple)}
        />
      )}
      {googleAuthAvailable && (
        <Pressable
          style={styles.googleButton}
          onPress={() => void social(signInWithGoogle)}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.googleText}>Continue with Google</Text>
        </Pressable>
      )}

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or with email</Text>
        <View style={styles.dividerLine} />
      </View>

      <TextInput
        style={styles.input} placeholder="Email" autoCapitalize="none"
        placeholderTextColor={theme.inkMuted}
        keyboardType="email-address" value={email} onChangeText={setEmail}
      />
      <TextInput
        style={styles.input} placeholder="Password" secureTextEntry
        placeholderTextColor={theme.inkMuted}
        value={password} onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={() => void signIn()} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 28, gap: 13 },
  masthead: { gap: 8, marginBottom: 10 },
  wordmark: { fontFamily: theme.fontDisplayBold, fontSize: 34, color: theme.ink },
  rule: { height: 1, backgroundColor: theme.border, marginTop: 4 },
  subtitle: { color: theme.inkSecondary, marginBottom: 6, fontSize: 14.5 },
  appleButton: { height: 50, width: "100%" },
  googleButton: {
    height: 50, borderRadius: 10, backgroundColor: theme.cardRaised,
    borderWidth: 1, borderColor: theme.borderSoft,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  googleG: { fontFamily: theme.fontDisplayBold, fontSize: 18, color: "#4285F4" },
  googleText: { fontSize: 15.5, color: theme.ink, fontWeight: "600" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.border },
  dividerText: { color: theme.inkMuted, fontSize: 12 },
  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 13,
    color: theme.ink, backgroundColor: theme.card, fontSize: 15,
  },
  button: {
    backgroundColor: theme.brass, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 4,
  },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.bg, fontSize: 16 },
  error: { color: theme.stampRed, fontSize: 13.5, lineHeight: 19 },
});
