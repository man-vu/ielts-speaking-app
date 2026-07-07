import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { requestMicPermission } from "@/src/lib/audio/session";
import { overline, theme } from "@/src/lib/theme";

const WAVE_BARS = [0, 0.09, 0.18, 0.3, 0.42, 0.3, 0.18, 0.09, 0.24, 0.5, 0.36];

/** Decorative readiness wave (design screen 02) — animates once the mic is
 *  granted. Levels aren't measured pre-session (the exam owns the audio
 *  session), so the checklist sticks to what we actually know. */
function ReadyWave({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0.24)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 410, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.24, duration: 410, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <View style={styles.wave}>
      {WAVE_BARS.map((delay, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            active
              ? {
                  transform: [
                    {
                      scaleY: pulse.interpolate({
                        inputRange: [0.24, 1],
                        outputRange: [0.24 + delay * 0.4, 1 - delay],
                      }),
                    },
                  ],
                }
              : { transform: [{ scaleY: 0.12 }], backgroundColor: theme.inkMuted },
          ]}
        />
      ))}
    </View>
  );
}

function ChecklistRow({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <View style={styles.checkRow}>
      {ok ? (
        <View style={styles.checkDone}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
      ) : (
        <View style={styles.checkPending} />
      )}
      <Text style={[styles.checkLabel, !ok && styles.checkLabelMuted]}>{label}</Text>
    </View>
  );
}

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
      <Text style={overline}>Before we begin</Text>
      <Text style={styles.title}>Sound check</Text>
      <Text style={styles.copy}>
        Alex speaks and listens in real time. Your quota is only used once you
        begin.
      </Text>

      <View style={styles.meterCard}>
        <ReadyWave active={granted} />
        <View style={styles.chips}>
          <Text style={styles.chip}>input · iphone mic</Text>
          <Text style={styles.chip}>{granted ? "mic · ready" : "mic · off"}</Text>
        </View>
      </View>

      <View style={styles.checklist}>
        <ChecklistRow ok={granted} label="Microphone access" />
        <ChecklistRow ok={null} label="Find a quiet room" />
        <ChecklistRow ok={null} label="Headphones recommended" />
      </View>

      <View style={styles.actions}>
        {!granted ? (
          <Pressable
            style={styles.button}
            onPress={() => void request()}
            accessibilityRole="button"
          >
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
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, styles.beginText]}>
              {starting ? "Starting…" : "Begin exam"}
            </Text>
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 26, paddingTop: 30, gap: 16 },
  title: {
    fontFamily: theme.fontDisplay, fontSize: 26, color: theme.ink, marginTop: -6,
  },
  copy: { color: theme.inkSecondary, fontSize: 14, lineHeight: 22 },
  meterCard: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingVertical: 24, paddingHorizontal: 18,
    alignItems: "center", gap: 16,
  },
  wave: { flexDirection: "row", alignItems: "center", gap: 4, height: 80 },
  waveBar: { width: 6, height: 80, borderRadius: 3, backgroundColor: theme.live },
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    fontFamily: theme.fontMono, fontSize: 11.5, color: theme.inkSecondary,
    backgroundColor: theme.cardRaised, borderRadius: 6,
    paddingVertical: 4, paddingHorizontal: 9, overflow: "hidden",
  },
  checklist: { gap: 11 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkDone: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: theme.live,
    alignItems: "center", justifyContent: "center",
  },
  checkMark: { color: theme.bg, fontSize: 11, fontWeight: "700" },
  checkPending: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: theme.border,
  },
  checkLabel: { fontSize: 13.5, color: theme.inkSecondary },
  checkLabelMuted: { color: theme.inkMuted },
  actions: { marginTop: "auto", gap: 10 },
  button: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, padding: 15, alignItems: "center",
  },
  begin: { backgroundColor: theme.brass },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 16 },
  beginText: { color: theme.bg },
  error: { color: theme.stampRed, fontSize: 13.5, lineHeight: 19 },
});
