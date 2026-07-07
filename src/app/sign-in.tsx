import { useState } from "react";
import { router } from "expo-router";
import {
  KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { supabase } from "@/src/lib/supabase";
import { overline, theme } from "@/src/lib/theme";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.masthead}>
        <Text style={overline}>The Speaking Test</Text>
        <Text style={styles.wordmark}>IELTS Speaking</Text>
        <View style={styles.rule} />
      </View>
      <Text style={styles.subtitle}>Sign in with your IELTS Pro account.</Text>
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
  container: { flex: 1, justifyContent: "center", padding: 28, gap: 13, backgroundColor: theme.bg },
  masthead: { gap: 8, marginBottom: 10 },
  wordmark: { fontFamily: theme.fontDisplayBold, fontSize: 34, color: theme.ink },
  rule: { height: 1, backgroundColor: theme.border, marginTop: 4 },
  subtitle: { color: theme.inkSecondary, marginBottom: 6, fontSize: 14.5 },
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
