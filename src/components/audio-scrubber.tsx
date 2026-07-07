import { useState } from "react";
import {
  Pressable, StyleSheet, Text, View, type GestureResponderEvent,
} from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { theme } from "@/src/lib/theme";

function fmt(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Themed playback scrubber for exam recordings — brass progress on the
 *  raised surface with mono timestamps; tap the track to seek. Icons are
 *  drawn with Views (glyphs render emoji-styled on iOS). */
export function AudioScrubber({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);

  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (duration > 0 && status.currentTime >= duration - 0.05) player.seekTo(0);
    player.play();
  }

  function seek(e: GestureResponderEvent) {
    if (trackWidth <= 0 || duration <= 0) return;
    const frac = Math.max(0, Math.min(1, e.nativeEvent.locationX / trackWidth));
    player.seekTo(frac * duration);
  }

  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause recording" : "Play recording"}
      >
        {status.playing ? (
          <View style={styles.pauseIcon}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        ) : (
          <View style={styles.playIcon} />
        )}
      </Pressable>
      <Text style={styles.time}>{fmt(status.currentTime)}</Text>
      <Pressable
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onPress={seek}
        hitSlop={{ top: 12, bottom: 12 }}
        accessibilityRole="adjustable"
        accessibilityLabel="Recording position"
        accessibilityValue={{ text: `${fmt(status.currentTime)} of ${fmt(duration)}` }}
      >
        <View style={styles.trackBed}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
      <Text style={styles.time}>{fmt(duration)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  playButton: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: theme.cardRaised,
    borderWidth: 1, borderColor: theme.brass, alignItems: "center", justifyContent: "center",
  },
  pressed: { transform: [{ scale: 0.94 }] },
  playIcon: {
    width: 0, height: 0, marginLeft: 3,
    borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 11,
    borderTopColor: "transparent", borderBottomColor: "transparent",
    borderLeftColor: theme.brass,
  },
  pauseIcon: { flexDirection: "row", gap: 3 },
  pauseBar: { width: 3.5, height: 13, borderRadius: 1.5, backgroundColor: theme.brass },
  time: {
    fontFamily: theme.fontMono, fontSize: 11, color: theme.inkMuted,
    fontVariant: ["tabular-nums"], minWidth: 34, textAlign: "center",
  },
  track: { flex: 1, justifyContent: "center", height: 24 },
  trackBed: {
    height: 4, borderRadius: 2, backgroundColor: theme.borderSoft, overflow: "hidden",
  },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: theme.brass },
});
