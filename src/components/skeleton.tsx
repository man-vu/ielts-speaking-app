import { useEffect, useRef } from "react";
import { Animated, Easing, type DimensionValue } from "react-native";
import { theme } from "@/src/lib/theme";

/** Pulsing placeholder block for loading states. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        width, height, borderRadius: radius,
        backgroundColor: theme.cardRaised, opacity: pulse,
      }}
    />
  );
}
