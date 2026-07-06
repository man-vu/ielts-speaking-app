import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { requestMicPermission } from "@/src/lib/audio/session";

export function Preflight({ onReady }: { onReady(): void }) {
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState("");

  async function request() {
    setError("");
    const ok = await requestMicPermission();
    if (!ok) {
      setError("Microphone access was denied. Enable it in Settings → IELTS Speaking.");
      return;
    }
    setGranted(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Equipment check</Text>
      <Text style={styles.copy}>
        The examiner speaks and listens in real time. Headphones are strongly
        recommended: they stop the examiner's voice from leaking into your
        recording and affecting your score. Your quota is only used once you
        begin.
      </Text>
      {!granted ? (
        <Pressable style={styles.button} onPress={() => void request()}>
          <Text style={styles.buttonText}>Enable microphone</Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.button, styles.begin]} onPress={onReady}>
          <Text style={styles.buttonText}>Begin exam</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: "600", color: "#f1f5f9", textAlign: "center" },
  copy: { color: "#94a3b8", textAlign: "center", lineHeight: 20 },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  begin: { backgroundColor: "#059669" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#f87171", textAlign: "center" },
});
