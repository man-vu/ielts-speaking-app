import { useRef, useState } from "react";
import {
  Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { overline, theme } from "@/src/lib/theme";

export const ONBOARDING_KEY = "onboarding-v1-done";

const PANELS: { title: string; body: string; glyph: string }[] = [
  {
    glyph: "I.",
    title: "A real examiner, in real time",
    body:
      "You'll speak with an AI examiner who follows the official IELTS Speaking format — greeting, questions, follow-ups. Answer naturally, out loud, in full sentences. Pauses to think are fine; the examiner waits.",
  },
  {
    glyph: "II.",
    title: "Three parts, real timing",
    body:
      "Part 1: everyday questions (4–5 min). Part 2: a cue card — one minute to prepare with the notes pad, then speak up to two minutes. Part 3: deeper discussion. Timers run exactly like the real exam.",
  },
  {
    glyph: "III.",
    title: "Sound advice",
    body:
      "Headphones give the examiner the cleanest ear, but speaker works too. While the examiner speaks, your microphone pauses — wait for the meter, then take the floor. Keep the app open during the exam.",
  },
  {
    glyph: "IV.",
    title: "Your band report",
    body:
      "After the exam your answers are assessed on the four official criteria — fluency, vocabulary, grammar, pronunciation — with a transcript, priority fixes, and drills. Full exams cost 3 units; practice parts cost 1.",
  },
];

export function Onboarding({ visible, onDone }: { visible: boolean; onDone(): void }) {
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const width = Dimensions.get("window").width;

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1").catch(() => {});
    onDone();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <Text style={[overline, styles.header]}>How the exam works</Text>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
        >
          {PANELS.map((p) => (
            <View key={p.glyph} style={[styles.panel, { width }]}>
              <Text style={styles.glyph}>{p.glyph}</Text>
              <Text style={styles.title}>{p.title}</Text>
              <Text style={styles.body}>{p.body}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <View style={styles.dots}>
            {PANELS.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
          {page < PANELS.length - 1 ? (
            <Pressable
              style={styles.button}
              onPress={() => {
                scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
                setPage(page + 1);
              }}
            >
              <Text style={styles.buttonText}>Next</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.button, styles.begin]} onPress={() => void finish()}>
              <Text style={[styles.buttonText, styles.beginText]}>I'm ready</Text>
            </Pressable>
          )}
          <Pressable onPress={() => void finish()}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, paddingTop: 28 },
  header: { textAlign: "center", color: theme.inkMuted },
  panel: { padding: 32, paddingTop: 48, gap: 14 },
  glyph: { fontFamily: theme.fontDisplayBold, fontSize: 44, color: theme.brass },
  title: { fontFamily: theme.fontDisplay, fontSize: 26, color: theme.ink, lineHeight: 32 },
  body: { color: theme.inkSecondary, fontSize: 15.5, lineHeight: 24 },
  footer: { padding: 24, gap: 16, alignItems: "center" },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.border },
  dotActive: { backgroundColor: theme.brass },
  button: {
    alignSelf: "stretch", backgroundColor: theme.cardRaised, borderWidth: 1,
    borderColor: theme.brass, borderRadius: 10, padding: 15, alignItems: "center",
  },
  begin: { backgroundColor: theme.brass },
  buttonText: { fontFamily: theme.fontDisplay, fontSize: 16, color: theme.ink },
  beginText: { color: theme.bg },
  skip: { color: theme.inkMuted, fontSize: 13 },
});
