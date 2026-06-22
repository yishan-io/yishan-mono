import { View } from "react-native";

import { MOBILE_UI_TOKENS } from "./ui-tokens";

type StatusDotProps = {
  color: string;
};

/** Owns the shared status-dot primitive only. */
export function StatusDot({ color }: StatusDotProps) {
  return (
    <View
      style={{
        backgroundColor: color,
        borderRadius: 999,
        height: MOBILE_UI_TOKENS.status.dotSize,
        width: MOBILE_UI_TOKENS.status.dotSize,
      }}
    />
  );
}
