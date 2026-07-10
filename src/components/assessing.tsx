import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { ExaminerBadge } from "./exam-stage";
import { overline, theme } from "@/src/lib/theme";

const CRITERIA = [
  "Fluency & coherence",
  "Lexical resource",
  "Grammatical range",
  "Pronunciation",
];

/** Scoring wait state (design screen 07): Alex deliberating inside brass
 *  rings, a criteria list that advances on a timer, and a scanning progress
 *  bar. The sequence is presentational — scoring is one opaque call — so it
 *  cycles rather than claiming real per-criterion progress. */
export function Assessing() {
  const [nowIndex, setNowIndex] = useState(0);
  const scan = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    // Advance through the criteria once and HOLD on the last — never wrap
    // (wrapping flipped already-"done" criteria back to pending, which read as
    // the screen looping/bugging out while scoring was still running).
    const timer = setInterval(
      () => setNowIndex((i) => Math.min(i + 1, CRITERIA.length - 1)),
      6000
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scan, {
        toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [scan]);

  const translateX = scan.interpolate({
    inputRange: [0, 1],
    outputRange: [-0.4 * trackWidth, trackWidth * 1.1],
  });

  return (
    <View style={styles.container}>
      <Text style={overline}>Assessment</Text>
      <View style={styles.center}>
        <ExaminerBadge speaking size={130} />
        <View style={styles.copy}>
          <Text style={styles.title}>Assessing your responses</Text>
          <Text style={styles.body}>
            Reviewing fluency, lexical range, grammar and pronunciation across
            your answers.
          </Text>
        </View>
      </View>
      <View style={styles.list}>
        {CRITERIA.map((label, i) => {
          const done = i < nowIndex;
          const now = i === nowIndex;
          return (
            <View key={label} style={styles.listRow}>
              <View
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  now && styles.dotNow,
                  !done && !now && styles.dotPending,
                ]}
              />
              <Text style={[styles.listLabel, now && styles.listLabelNow]}>{label}</Text>
              {done && <Text style={styles.listState}>done</Text>}
              {now && <Text style={[styles.listState, styles.listStateNow]}>now</Text>}
            </View>
          );
        })}
      </View>
      <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
        {trackWidth > 0 && (
          <Animated.View style={[styles.scanner, { transform: [{ translateX }] }]} />
        )}
      </View>
      <Text style={styles.eta}>usually under a minute</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 28, gap: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 26 },
  copy: { alignItems: "center", gap: 8 },
  title: { fontFamily: theme.fontDisplay, fontSize: 22, color: theme.ink },
  body: {
    fontSize: 13.5, lineHeight: 20, color: theme.inkSecondary,
    textAlign: "center", maxWidth: 230,
  },
  list: { gap: 12 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotDone: { backgroundColor: theme.live },
  dotNow: { backgroundColor: theme.brass },
  dotPending: { borderWidth: 1, borderColor: theme.border },
  listLabel: { flex: 1, fontSize: 13, color: theme.inkSecondary },
  listLabelNow: { color: theme.ink },
  listState: { fontFamily: theme.fontMono, fontSize: 11, color: theme.live },
  listStateNow: { color: theme.brass },
  track: {
    height: 4, borderRadius: 2, backgroundColor: theme.borderSoft, overflow: "hidden",
  },
  scanner: { width: "40%", height: 4, borderRadius: 2, backgroundColor: theme.brass, opacity: 0.8 },
  eta: {
    textAlign: "center", fontFamily: theme.fontMono, fontSize: 12, color: theme.inkMuted,
  },
});
