import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useExamOrchestrator } from "@/src/hooks/use-exam-orchestrator";
import { Preflight } from "@/src/components/preflight";
import { CueCard } from "@/src/components/cue-card";
import type { ExamPhase } from "@/src/lib/exam/machine";
import type { SimMode } from "@/src/lib/types";

const PHASE_LABELS: Record<ExamPhase, string> = {
  connecting: "Connecting…", intro: "Introduction", part1: "Part 1",
  part2_prep: "Part 2 — preparation", part2_talk: "Part 2 — your talk",
  part2_rounding: "Part 2", part3: "Part 3", ended: "Finished",
};
const MODES: SimMode[] = ["full", "part1", "part2", "part3"];

export default function ExamScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ mode: string }>();
  const mode = (MODES.includes(params.mode as SimMode) ? params.mode : "part1") as SimMode;
  const exam = useExamOrchestrator(mode);
  const [retrying, setRetrying] = useState(false);

  if (exam.screen === "preflight") {
    return (
      <>
        <Stack.Screen options={{ title: "Equipment check" }} />
        <Preflight onReady={() => void exam.begin()} />
      </>
    );
  }

  if (exam.screen === "fatal" || exam.screen === "uploading" || exam.screen === "upload_failed") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: PHASE_LABELS[exam.phase] }} />
        <Text style={styles.status}>
          {exam.screen === "uploading" ? "Uploading your answers for scoring…" : exam.banner || "Something went wrong."}
        </Text>
        {exam.screen === "upload_failed" && (
          <Pressable
            style={styles.button}
            onPress={() => {
              if (retrying) return;
              setRetrying(true);
              void exam.retryUpload().finally(() => setRetrying(false));
            }}
            disabled={retrying}
          >
            <Text style={styles.buttonText}>{retrying ? "Retrying…" : "Retry upload"}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const showCueCard =
    (exam.phase === "part2_prep" || exam.phase === "part2_talk" || exam.phase === "part2_rounding") &&
    exam.display?.cueCard;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: PHASE_LABELS[exam.phase],
          headerRight: () =>
            exam.phase !== "ended" && exam.phase !== "connecting" ? (
              <Pressable
                onPress={() =>
                  Alert.alert("End the exam now?", "Completed parts will still be scored.", [
                    { text: "Keep going", style: "cancel" },
                    { text: "End exam", style: "destructive", onPress: exam.endEarly },
                  ])
                }
              >
                <Text style={styles.endLink}>End</Text>
              </Pressable>
            ) : null,
        }}
      />
      {exam.banner ? <Text style={styles.banner}>{exam.banner}</Text> : null}
      {showCueCard && exam.display?.cueCard ? (
        <CueCard
          text={exam.display.cueCard}
          secondsLeft={exam.phase === "part2_prep" ? exam.countdown : null}
        />
      ) : null}
      {exam.phase === "part2_talk" && exam.countdown !== null && (
        <Text style={styles.talkTimer}>{exam.countdown}s</Text>
      )}
      {exam.phase !== "part2_prep" && (
        <View style={styles.center}>
          <View style={[styles.orb, exam.liveStatus === "live" && styles.orbLive]} />
          <Text style={styles.status}>
            {exam.phase === "connecting" ? "Connecting to your examiner…" : "The examiner is listening."}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 24 },
  status: { color: "#94a3b8", textAlign: "center" },
  banner: { color: "#fcd34d", backgroundColor: "#45309e22", padding: 10, borderRadius: 8 },
  talkTimer: { color: "#34d399", fontSize: 22, textAlign: "center", fontVariant: ["tabular-nums"] },
  orb: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#4f46e544" },
  orbLive: { backgroundColor: "#4f46e5" },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600" },
  endLink: { color: "#f87171", fontWeight: "600" },
});
