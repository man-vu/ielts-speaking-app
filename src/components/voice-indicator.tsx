import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { overline, theme } from "@/src/lib/theme";

interface VoiceIndicatorProps {
  connecting: boolean;
  examinerSpeaking: boolean;
  micLevel: number; // 0..1
}

/** The exam room's centerpiece: breathing brass rings while the examiner
 *  speaks; a live level meter while the candidate holds the floor. Makes
 *  the half-duplex turn-taking legible at a glance. */
export function VoiceIndicator({ connecting, examinerSpeaking, micLevel }: VoiceIndicatorProps) {
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!examinerSpeaking) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [examinerSpeaking, breath]);

  const ringScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.08] });

  const label = connecting
    ? "Finding Alex, your examiner…"
    : examinerSpeaking
      ? "Alex is speaking"
      : "Your turn — mic is live";

  // Five bars with fixed multipliers give the meter a natural silhouette.
  const bars = [0.45, 0.75, 1, 0.75, 0.45];

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        {examinerSpeaking ? (
          <View style={styles.center}>
            <Animated.View
              style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            <Animated.View
              style={[
                styles.ring, styles.ringInner,
                { transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
            <View style={styles.disc}>
              <Text style={styles.discGlyph}>A</Text>
            </View>
          </View>
        ) : (
          <View style={styles.meterRow}>
            {bars.map((mult, i) => {
              const h = connecting ? 6 : 6 + Math.round(52 * Math.min(1, micLevel * mult * 1.6));
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: connecting ? theme.inkMuted : theme.live },
                  ]}
                />
              );
            })}
          </View>
        )}
      </View>
      <Text style={[overline, styles.label]} accessibilityLiveRegion="polite">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: 18 },
  stage: { height: 120, justifyContent: "center", alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute", width: 96, height: 96, borderRadius: 48,
    borderWidth: 1.5, borderColor: theme.brass,
  },
  ringInner: { width: 72, height: 72, borderRadius: 36 },
  disc: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: theme.cardRaised,
    borderWidth: 1, borderColor: theme.brass, alignItems: "center", justifyContent: "center",
  },
  discGlyph: { fontFamily: theme.fontDisplayBold, fontSize: 24, color: theme.brass },
  meterRow: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 64 },
  bar: { width: 10, borderRadius: 4 },
  label: { color: theme.inkSecondary },
});
