import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { overline, theme } from "@/src/lib/theme";

const BAR_MULTS = [0.45, 0.75, 1, 0.75, 0.45];

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Alex's presence: monogram disc in breathing rings (design screens 01/03/07). */
export function ExaminerBadge({ speaking, size = 120 }: { speaking: boolean; size?: number }) {
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!speaking) return;
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
  }, [speaking, breath]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const ringOpacity = speaking
    ? breath.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.1] })
    : 0.3;
  const disc = Math.round(size * 0.47);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.82, height: size * 0.82, borderRadius: (size * 0.82) / 2,
            transform: [{ scale }], opacity: ringOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.6, height: size * 0.6, borderRadius: (size * 0.6) / 2,
            transform: [{ scale }], opacity: ringOpacity,
          },
        ]}
      />
      <View style={[styles.disc, { width: disc, height: disc, borderRadius: disc / 2 }]}>
        <Text style={[styles.glyph, { fontSize: Math.round(disc * 0.43) }]}>A</Text>
      </View>
    </View>
  );
}

/** Five-bar candidate meter driven by live mic level. */
export function LiveMeter({ level, height = 56 }: { level: number; height?: number }) {
  return (
    <View style={[styles.meterRow, { height }]}>
      {BAR_MULTS.map((mult, i) => {
        const h = 6 + Math.round((height - 8) * Math.min(1, level * mult * 1.6));
        return <View key={i} style={[styles.bar, { height: h }]} />;
      })}
    </View>
  );
}

interface ExamStageProps {
  connecting: boolean;
  examinerSpeaking: boolean;
  micLevel: number;
}

/** The interview/discussion stage (design screens 03/06): Alex with a live
 *  status line; while the floor is the candidate's, an answering panel with
 *  an elapsed clock and the live meter. */
export function ExamStage({ connecting, examinerSpeaking, micLevel }: ExamStageProps) {
  const [elapsed, setElapsed] = useState(0);
  const answering = !connecting && !examinerSpeaking;

  useEffect(() => {
    if (!answering) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [answering]);

  return (
    <View style={styles.stage}>
      <View style={styles.examinerRow}>
        <ExaminerBadge speaking={examinerSpeaking} size={96} />
        <View style={styles.examinerText}>
          <Text style={styles.name}>Alex</Text>
          <Text
            style={[
              styles.statusLine,
              { color: connecting ? theme.inkMuted : examinerSpeaking ? theme.live : theme.inkMuted },
            ]}
            accessibilityLiveRegion="polite"
          >
            {connecting ? "Connecting…" : examinerSpeaking ? "Speaking" : "Listening"}
          </Text>
        </View>
      </View>

      {answering && (
        <View style={styles.answerCard}>
          <View style={styles.answerHead}>
            <Text style={[overline, styles.answerLabel]}>You're answering</Text>
            <Text style={styles.answerClock}>{fmt(elapsed)}</Text>
          </View>
          <View style={styles.meterCenter}>
            <LiveMeter level={micLevel} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { gap: 18 },
  ring: { position: "absolute", borderWidth: 1.5, borderColor: theme.brass },
  disc: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    alignItems: "center", justifyContent: "center",
  },
  glyph: { fontFamily: theme.fontDisplayBold, color: theme.brass },
  examinerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  examinerText: { gap: 3 },
  name: { fontFamily: theme.fontDisplay, fontSize: 16, color: theme.ink },
  statusLine: { fontSize: 12.5 },
  answerCard: {
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, padding: 16, gap: 14,
  },
  answerHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  answerLabel: { color: theme.inkMuted },
  answerClock: {
    fontFamily: theme.fontMono, fontSize: 13, color: theme.ink,
    fontVariant: ["tabular-nums"],
  },
  meterCenter: { alignItems: "center" },
  meterRow: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  bar: { width: 10, borderRadius: 4, backgroundColor: theme.live },
});
