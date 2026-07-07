import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useNavigation } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useExamOrchestrator } from "@/src/hooks/use-exam-orchestrator";
import { Preflight } from "@/src/components/preflight";
import { CueCard } from "@/src/components/cue-card";
import { NotesPad } from "@/src/components/notes-pad";
import { VoiceIndicator } from "@/src/components/voice-indicator";
import type { ExamPhase } from "@/src/lib/exam/machine";
import type { SimMode } from "@/src/lib/types";
import { overline, theme } from "@/src/lib/theme";

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
  const [notes, setNotes] = useState("");
  const navigation = useNavigation();

  const midExam = exam.screen === "exam" && exam.phase !== "ended" && exam.phase !== "connecting";

  function confirmEndExam() {
    Alert.alert("End the exam now?", "Completed parts will still be scored.", [
      { text: "Keep going", style: "cancel" },
      { text: "End exam", style: "destructive", onPress: exam.endEarly },
    ]);
  }

  // I3: guard back navigation mid-exam. usePreventRemove isn't exported by
  // expo-router in this SDK and @react-navigation/native isn't installed as
  // a standalone package here, so fall back to the underlying
  // navigation.addListener("beforeRemove", ...) it's built on. On confirm we
  // call exam.endEarly() directly (NOT the intercepted action) — endEarly
  // drives finishAndScore -> router.replace, which supersedes any pending
  // navigation anyway.
  useEffect(() => {
    return navigation.addListener("beforeRemove", (e) => {
      if (!midExam) return;
      e.preventDefault();
      confirmEndExam();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, midExam]);

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
          {exam.screen === "uploading"
            ? "Sealing your answers for marking…"
            : exam.banner || "Something went wrong."}
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

  const inPart2 =
    exam.phase === "part2_prep" || exam.phase === "part2_talk" || exam.phase === "part2_rounding";
  const showCueCard = inPart2 && exam.display?.cueCard;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: PHASE_LABELS[exam.phase],
          headerRight: () =>
            exam.phase !== "ended" && exam.phase !== "connecting" ? (
              <Pressable onPress={confirmEndExam}>
                <Text style={styles.endLink}>End</Text>
              </Pressable>
            ) : null,
        }}
      />

      {exam.banner ? <Text style={styles.banner}>{exam.banner}</Text> : null}

      {exam.phase === "part2_talk" && exam.countdown !== null && (
        <View style={styles.talkTimerRow}>
          <Text style={overline}>Speaking time</Text>
          <Text style={styles.talkTimer}>
            {Math.floor(exam.countdown / 60)}:{String(exam.countdown % 60).padStart(2, "0")}
          </Text>
        </View>
      )}

      {showCueCard && exam.display?.cueCard ? (
        <CueCard
          text={exam.display.cueCard}
          secondsLeft={exam.phase === "part2_prep" ? exam.countdown : null}
        />
      ) : null}

      {inPart2 && (exam.phase === "part2_prep" || notes.length > 0) ? (
        <NotesPad value={notes} onChange={setNotes} editable={exam.phase === "part2_prep"} />
      ) : null}

      {exam.phase !== "part2_prep" && (
        <View style={styles.stageWrap}>
          <VoiceIndicator
            connecting={exam.phase === "connecting" || exam.liveStatus !== "live"}
            examinerSpeaking={exam.examinerSpeaking}
            micLevel={exam.micLevel}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 20, flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 28 },
  status: { color: theme.inkSecondary, textAlign: "center", fontSize: 15.5, lineHeight: 22 },
  banner: {
    color: theme.brass, backgroundColor: theme.card, borderWidth: 1,
    borderColor: theme.borderSoft, padding: 12, borderRadius: 10, fontSize: 13.5, lineHeight: 19,
  },
  talkTimerRow: { alignItems: "center", gap: 4 },
  talkTimer: {
    fontFamily: theme.fontMonoBold, fontSize: 34, color: theme.live,
    fontVariant: ["tabular-nums"],
  },
  stageWrap: { flex: 1, justifyContent: "center", paddingVertical: 24 },
  button: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center",
  },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15 },
  endLink: { color: theme.stampRed, fontFamily: theme.fontDisplay, fontSize: 15 },
});
