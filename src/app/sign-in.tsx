import { useState } from "react";
import { router } from "expo-router";
import {
  KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput,
} from "react-native";
import { supabase } from "@/src/lib/supabase";

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
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.subtitle}>Use your IELTS Pro account.</Text>
      <TextInput
        style={styles.input} placeholder="Email" autoCapitalize="none"
        keyboardType="email-address" value={email} onChangeText={setEmail}
      />
      <TextInput
        style={styles.input} placeholder="Password" secureTextEntry
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
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#0f172a" },
  title: { fontSize: 28, fontWeight: "600", color: "#f1f5f9" },
  subtitle: { color: "#94a3b8", marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: "#334155", borderRadius: 8, padding: 12,
    color: "#f1f5f9", backgroundColor: "#1e293b",
  },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#f87171" },
});
