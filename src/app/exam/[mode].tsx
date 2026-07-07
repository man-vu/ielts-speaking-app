import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useNavigation } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import { useExamOrchestrator } from "@/src/hooks/use-exam-orchestrator";
import { Preflight } from "@/src/components/preflight";
import { CueCard } from "@/src/components/cue-card";
import { NotesPad } from "@/src/components/notes-pad";
import { ExamStage, LiveMeter } from "@/src/components/exam-stage";
import type { ExamPhase } from "@/src/lib/exam/machine";
import type { SimMode } from "@/src/lib/types";
import { overline, theme } from "@/src/lib/theme";

const PHASE_LABELS: Record<ExamPhase, string> = {
  connecting: "Connecting…", intro: "Introduction", part1: "Part 1 · Interview",
  part2_prep: "Part 2 · Preparation", part2_talk: "Part 2 · Speaking",
  part2_rounding: "Part 2", part3: "Part 3 · Discussion", ended: "Finished",
};
const MODES: SimMode[] = ["full", "part1", "part2", "part3"];

function fmt(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ExamScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ mode: string }>();
  const mode = (MODES.includes(params.mode as SimMode) ? params.mode : "part1") as SimMode;
  const exam = useExamOrchestrator(mode);
  const [retrying, setRetrying] = useState(false);
  const [notes, setNotes] = useState("");
  const navigation = useNavigation();

  const midExam = exam.screen === "exam" && exam.phase !== "ended" && exam.phase !== "connecting";
  const prevSpeakingRef = useRef(false);

  // A gentle tap when Alex yields the floor — eyes-free turn-taking.
  useEffect(() => {
    if (prevSpeakingRef.current && !exam.examinerSpeaking && midExam && exam.liveStatus === "live") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    prevSpeakingRef.current = exam.examinerSpeaking;
  }, [exam.examinerSpeaking, exam.liveStatus, midExam]);

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
        <Stack.Screen options={{ title: "Sound check" }} />
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
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>{retrying ? "Retrying…" : "Retry upload"}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const inPart2 =
    exam.phase === "part2_prep" || exam.phase === "part2_talk" || exam.phase === "part2_rounding";
  const connecting = exam.phase === "connecting" || exam.liveStatus !== "live";
  const cueCardTopic = exam.display?.cueCard?.split("\n")[0] ?? "";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: PHASE_LABELS[exam.phase],
          headerRight: () =>
            exam.phase !== "ended" && exam.phase !== "connecting" ? (
              <Pressable onPress={confirmEndExam} accessibilityRole="button">
                <Text style={styles.endLink}>End</Text>
              </Pressable>
            ) : null,
        }}
      />

      {exam.banner ? <Text style={styles.banner}>{exam.banner}</Text> : null}

      {exam.phase === "part2_prep" && (
        <>
          <Text style={styles.prepCopy}>
            You have one minute to prepare. You may make notes.
          </Text>
          {exam.display?.cueCard ? (
            <CueCard text={exam.display.cueCard} secondsLeft={exam.countdown} />
          ) : null}
          <NotesPad value={notes} onChange={setNotes} editable />
        </>
      )}

      {exam.phase === "part2_talk" && (
        <>
          <View style={styles.talkHeader}>
            <Text style={overline}>Part 2 · Speaking</Text>
            <Text style={styles.talkOf}>of 2:00</Text>
          </View>
          <View style={styles.talkClockBlock}>
            <Text style={styles.talkClock}>
              {exam.countdown !== null ? fmt(exam.countdown) : "–:––"}
            </Text>
            <Text style={styles.talkHint}>Keep going until Alex stops you</Text>
          </View>
          <View style={styles.meterCenter}>
            <LiveMeter level={exam.micLevel} height={58} />
          </View>
          {cueCardTopic ? (
            <View style={styles.topicCard}>
              <Text style={[overline, styles.topicLabel]}>Topic</Text>
              <Text style={styles.topicText}>{cueCardTopic}</Text>
            </View>
          ) : null}
          {notes.length > 0 && <NotesPad value={notes} onChange={setNotes} editable={false} />}
          <Pressable
            style={styles.finishEarly}
            onPress={confirmEndExam}
            accessibilityRole="button"
          >
            <Text style={styles.finishEarlyText}>Finish early</Text>
          </Pressable>
        </>
      )}

      {exam.phase === "part2_rounding" && (
        <>
          {exam.display?.cueCard ? (
            <CueCard text={exam.display.cueCard} secondsLeft={null} />
          ) : null}
          <ExamStage
            connecting={connecting}
            examinerSpeaking={exam.examinerSpeaking}
            micLevel={exam.micLevel}
          />
        </>
      )}

      {!inPart2 && exam.phase !== "ended" && (
        <View style={styles.stageWrap}>
          <ExamStage
            connecting={connecting}
            examinerSpeaking={exam.examinerSpeaking}
            micLevel={exam.micLevel}
          />
        </View>
      )}

      {exam.phase === "ended" && (
        <View style={styles.center}>
          <Text style={styles.status}>The exam has finished.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, gap: 18, flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 28 },
  status: { color: theme.inkSecondary, textAlign: "center", fontSize: 15.5, lineHeight: 22 },
  banner: {
    color: theme.brass, backgroundColor: theme.card, borderWidth: 1,
    borderColor: theme.borderSoft, padding: 12, borderRadius: 10, fontSize: 13.5, lineHeight: 19,
  },
  prepCopy: { color: theme.inkSecondary, fontSize: 14, lineHeight: 22 },
  talkHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  talkOf: { fontFamily: theme.fontMono, fontSize: 11, color: theme.inkMuted },
  talkClockBlock: { alignItems: "center", gap: 6, paddingTop: 2 },
  talkClock: {
    fontFamily: theme.fontMonoBold, fontSize: 44, lineHeight: 48, color: theme.ink,
    fontVariant: ["tabular-nums"],
  },
  talkHint: { fontSize: 12, color: theme.inkMuted },
  meterCenter: { alignItems: "center" },
  topicCard: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
  },
  topicLabel: { color: theme.inkMuted, minWidth: 52 },
  topicText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: theme.inkSecondary },
  finishEarly: {
    marginTop: "auto", borderWidth: 1, borderColor: theme.borderSoft,
    borderRadius: 10, padding: 14, alignItems: "center",
  },
  finishEarlyText: { fontFamily: theme.fontDisplay, color: theme.stampRed, fontSize: 15 },
  stageWrap: { flex: 1, justifyContent: "center", paddingVertical: 20 },
  button: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center",
  },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15 },
  endLink: { color: theme.stampRed, fontFamily: theme.fontDisplay, fontSize: 15 },
});
