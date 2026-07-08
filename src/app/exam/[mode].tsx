import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useNavigation } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import { PART2_TALK_SECONDS } from "@/src/lib/config";
import { useExamOrchestrator } from "@/src/hooks/use-exam-orchestrator";
import { Preflight } from "@/src/components/preflight";
import { CueCard } from "@/src/components/cue-card";
import { NotesPad } from "@/src/components/notes-pad";
import { Assessing } from "@/src/components/assessing";
import { ExamStage, LiveMeter } from "@/src/components/exam-stage";
import type { ExamPhase } from "@/src/lib/exam/machine";
import type { SimMode } from "@/src/lib/types";
import { overline, theme } from "@/src/lib/theme";

const PHASE_LABELS: Record<ExamPhase, string> = {
  connecting: "Connecting…", intro: "Introduction", part1: "Part 1 · Interview",
  part2_prep: "Part 2 · Preparation", part2_talk: "Part 2 · Speaking",
  part2_rounding: "Part 2", part3: "Part 3 · Discussion", ended: "Finished",
};
const MODES: SimMode[] = ["full", "part1", "part2", "part3", "chat"];

function fmt(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ExamScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ mode: string; slug?: string }>();
  const mode = (MODES.includes(params.mode as SimMode) ? params.mode : "part1") as SimMode;
  const exam = useExamOrchestrator(mode, typeof params.slug === "string" ? params.slug : undefined);
  const [retrying, setRetrying] = useState(false);
  const [notes, setNotes] = useState("");
  const [readyTapped, setReadyTapped] = useState(false);
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

  const examinerName = exam.display?.examiner?.name ?? "Alex";
  const examinerInitial = exam.display?.examiner?.initial ?? "A";
  const screenTitle =
    mode === "chat" && exam.phase !== "ended" && exam.phase !== "connecting"
      ? `Chatting with ${examinerName}`
      : PHASE_LABELS[exam.phase];

  if (exam.screen === "fatal" || exam.screen === "uploading" || exam.screen === "upload_failed") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: screenTitle }} />
        {exam.screen === "uploading" ? (
          <Assessing />
        ) : (
          <Text style={styles.status}>{exam.banner || "Something went wrong."}</Text>
        )}
        {exam.screen === "fatal" && exam.phase === "connecting" && (
          <Pressable
            style={styles.button}
            onPress={exam.restart}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        )}
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
          title: screenTitle,
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
          <Pressable
            style={({ pressed }) => [styles.readyButton, pressed && { transform: [{ scale: 0.98 }] }]}
            onPress={() => {
              if (readyTapped) return;
              setReadyTapped(true);
              exam.startTalkEarly();
            }}
            disabled={readyTapped}
            accessibilityRole="button"
          >
            <Text style={styles.readyText}>
              {readyTapped ? "Alex will invite you now…" : "I'm ready to speak"}
            </Text>
          </Pressable>
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
            <Text style={styles.talkHint}>Keep going until {examinerName} stops you</Text>
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
          {(() => {
            const elapsed = PART2_TALK_SECONDS - (exam.countdown ?? PART2_TALK_SECONDS);
            if (elapsed < 20 || exam.talkWords < 15) return null;
            return (
              <View style={styles.chipRow}>
                <Text style={styles.chip}>{Math.round(exam.talkWords / (elapsed / 60))} wpm</Text>
                <Text style={styles.chip}>{exam.talkWords} words</Text>
              </View>
            );
          })()}
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
            name={examinerName}
            initial={examinerInitial}
          />
        </>
      )}

      {exam.phase === "part1" && mode !== "chat" && exam.lastExchange.examiner ? (
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>
            {exam.questionCount > 0 ? `Question ${exam.questionCount}` : "Question"}
          </Text>
          <Text style={styles.questionText}>{exam.lastExchange.examiner}</Text>
        </View>
      ) : null}

      {(exam.phase === "part3" || (mode === "chat" && exam.phase === "part1")) &&
        exam.lastExchange.examiner ? (
        <View style={styles.exchange}>
          <View style={styles.exchangeRow}>
            <View style={styles.exchangeAvatar}>
              <Text style={styles.exchangeAvatarText}>{examinerInitial}</Text>
            </View>
            <View style={styles.exchangeBubbleExaminer}>
              <Text style={styles.exchangeExaminerText}>{exam.lastExchange.examiner}</Text>
            </View>
          </View>
          {exam.lastExchange.candidate ? (
            <View style={[styles.exchangeRow, styles.exchangeRowYou]}>
              <View style={styles.exchangeBubbleYou}>
                <Text style={styles.exchangeYouText}>{exam.lastExchange.candidate}</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {!inPart2 && exam.phase !== "ended" && (
        <View style={styles.stageWrap}>
          <ExamStage
            connecting={connecting}
            examinerSpeaking={exam.examinerSpeaking}
            micLevel={exam.micLevel}
            name={examinerName}
            initial={examinerInitial}
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
  readyButton: {
    backgroundColor: theme.brass, borderRadius: 10, padding: 15, alignItems: "center",
  },
  readyText: { fontFamily: theme.fontDisplay, fontSize: 16, color: theme.bg },
  finishEarly: {
    marginTop: "auto", borderWidth: 1, borderColor: theme.borderSoft,
    borderRadius: 10, padding: 14, alignItems: "center",
  },
  finishEarlyText: { fontFamily: theme.fontDisplay, color: theme.stampRed, fontSize: 15 },
  stageWrap: { flex: 1, justifyContent: "center", paddingVertical: 20 },
  questionCard: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, padding: 16, gap: 8,
  },
  questionLabel: {
    fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: theme.inkMuted,
  },
  questionText: {
    fontFamily: theme.fontDisplay, fontSize: 17, lineHeight: 25, color: theme.ink,
  },
  exchange: { gap: 10 },
  exchangeRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  exchangeRowYou: { justifyContent: "flex-end" },
  exchangeAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: theme.cardRaised,
    borderWidth: 1, borderColor: theme.brass, alignItems: "center", justifyContent: "center",
  },
  exchangeAvatarText: { fontFamily: theme.fontDisplay, fontSize: 15, color: theme.brass },
  exchangeBubbleExaminer: {
    flex: 1, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    borderRadius: 14, borderTopLeftRadius: 4, padding: 12,
  },
  exchangeExaminerText: { fontSize: 13.5, lineHeight: 20, color: theme.ink },
  exchangeBubbleYou: {
    maxWidth: "84%", backgroundColor: theme.cardRaised, borderWidth: 1,
    borderColor: theme.borderSoft, borderRadius: 14, borderBottomRightRadius: 4, padding: 12,
  },
  exchangeYouText: { fontSize: 13.5, lineHeight: 20, color: theme.inkSecondary },
  chipRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  chip: {
    fontFamily: theme.fontMono, fontSize: 12, color: theme.inkSecondary,
    backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border,
    borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12, overflow: "hidden",
  },
  button: {
    backgroundColor: theme.cardRaised, borderWidth: 1, borderColor: theme.brass,
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center",
  },
  buttonText: { fontFamily: theme.fontDisplay, color: theme.ink, fontSize: 15 },
  endLink: { color: theme.stampRed, fontFamily: theme.fontDisplay, fontSize: 15 },
});
