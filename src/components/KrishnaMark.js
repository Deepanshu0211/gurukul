import React from "react";
import Svg, { Path, Circle } from "react-native-svg";

export default function KrishnaMark({ size = 32, color = "#FFFFFF" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path d="M10 34 L34 10" stroke={color} strokeWidth={3.4} strokeLinecap="round" />
      <Circle cx="16.5" cy="27.5" r="1.6" fill={color} />
      <Circle cx="20.5" cy="23.5" r="1.6" fill={color} />
      <Circle cx="24.5" cy="19.5" r="1.6" fill={color} />
      <Path d="M32 14 C34.5 12 37 12.5 38 14.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.75} />
      <Path d="M34.5 10.5 C36.5 9 38.5 9.6 39.3 11.3" stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
      <Path d="M8 36 C6 30 9 24 15 22 C13 27 12.5 32 15 37" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="13.5" cy="24.5" r="2.4" stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}