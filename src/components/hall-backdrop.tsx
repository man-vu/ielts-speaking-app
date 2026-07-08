import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** The examination-hall backdrop from the design: a navy glow at the top
 *  settling into deep ink. Rendered inside each screen (absolute fill) —
 *  the navigator itself cannot host a shared background on this SDK. */
export function HallBackdrop() {
  return (
    <LinearGradient
      colors={["#1B2242", "#12162B", "#0D0F1E"]}
      locations={[0, 0.42, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
