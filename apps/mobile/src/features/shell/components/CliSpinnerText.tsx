import { useEffect, useState } from "react";
import { Text } from "tamagui";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;

type CliSpinnerTextProps = {
  fontSize?: number;
};

export function CliSpinnerText({ fontSize = 20 }: CliSpinnerTextProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((current) => (current + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <Text
      color="$yellow10"
      fontSize={fontSize}
      style={{
        fontFamily: "Menlo",
        lineHeight: fontSize,
        textAlign: "center",
        userSelect: "none" as never,
      }}
    >
      {SPINNER_FRAMES[frameIndex]}
    </Text>
  );
}
