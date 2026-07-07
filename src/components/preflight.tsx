import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { requestMicPermission } from "@/src/lib/audio/session";
import { overline, theme } from "@/src/lib/theme";

export function Preflight({ onReady }: { onReady(): void }) {
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

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
      <Text style={overline}>Before you begin</Text>
      <Text style={styles.title}>Equipment check</Text>
      <Text style={styles.copy}>
        The examiner speaks and listens in real time. Headphones give the
        cleanest ear, though speaker works too — your microphone pauses
        automatically while the examiner talks. Your quota is only used once
        you begin.
      </Text>
      {!granted ? (
        <Pressable style={styles.button} onPress={() => void request()}>
          <Text style={styles.buttonText}>Enable microphone</Text>
        </Pressable>
      ) : (
        <Pressable
          style={[styles.button, styles.begin]}
          onPress={() => {
            if (starting) return;
            setStarting(true);
            onReady();
          }}
          disabled={starting}
        >
          <Text style={[styles.buttonText, styles.beginText]}>
            {starting ? "Starting…" : "Begin exam"}
          </Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 28, gap: 14 },
  title: {
    fontFamily: theme.fontDisplayBold, fontSize: 30, color: theme.ink, lineHeight: 36,
  },
  copy: { color: theme.inkSecondary, fontSize: 15.5, lineHeight: 24, marginBottom: 10 },
  button: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, padding: 15, alignItems: "center",
  },
  begin: { backgroundColor: theme.brass },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 16 },
  beginText: { color: theme.bg },
  error: { color: theme.stampRed, fontSize: 13.5, lineHeight: 19 },
});
