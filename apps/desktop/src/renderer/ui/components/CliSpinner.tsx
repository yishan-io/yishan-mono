import { Box } from "@mui/material";
import { useEffect, useState } from "react";

/** Braille spinner frames used for compact workspace progress animation. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;
const RAINBOW_COLORS = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6"];

export type CliSpinnerProps = {
  fontSize?: number;
  color?: string;
  rainbow?: boolean;
};

/** Resolves the active spinner color from explicit color and rainbow mode. */
function resolveSpinnerColor(frameIndex: number, color: string | undefined, rainbow: boolean): string {
  if (rainbow) {
    return RAINBOW_COLORS[frameIndex % RAINBOW_COLORS.length] ?? "#f59e0b";
  }

  return color ?? "warning.main";
}

/** Renders one lightweight CLI spinner for running task state. */
export function CliSpinner({ fontSize = 11, color, rainbow = false }: CliSpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const activeColor = resolveSpinnerColor(frameIndex, color, rainbow);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Box
      component="span"
      aria-hidden
      data-testid="cli-spinner"
      data-spinner-color={activeColor}
      sx={{
        fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        color: activeColor,
        userSelect: "none",
        lineHeight: 1,
        width: "1ch",
        textAlign: "center",
        fontSize,
      }}
    >
      {SPINNER_FRAMES[frameIndex]}
    </Box>
  );
}
