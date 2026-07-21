import { Box, Button } from "@mui/material";

type ThinkingLevelControlProps = {
  thinkingLevel: string;
  onCycle: () => void;
};

const ACTIVE_BAR_COUNTS: Record<string, number> = {
  off: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
};

const BAR_HEIGHTS = [4, 6, 8, 10, 12];
const THINKING_LEVEL_LABELS: Record<string, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
};
const THINKING_LEVEL_BUTTON_LABEL_PREFIX = "Thinking level:";

function normalizeThinkingLevel(thinkingLevel: string): string {
  return Object.hasOwn(ACTIVE_BAR_COUNTS, thinkingLevel) ? thinkingLevel : "off";
}

/** Displays the current thinking level as five ascending bars and cycles it when activated. */
export function ThinkingLevelControl({ thinkingLevel, onCycle }: ThinkingLevelControlProps) {
  const normalizedThinkingLevel = normalizeThinkingLevel(thinkingLevel);
  const activeBarCount = ACTIVE_BAR_COUNTS[normalizedThinkingLevel] ?? 0;
  const thinkingLevelLabel = THINKING_LEVEL_LABELS[normalizedThinkingLevel] ?? THINKING_LEVEL_LABELS.off;
  const accessibleLabel = `${THINKING_LEVEL_BUTTON_LABEL_PREFIX} ${thinkingLevelLabel}`;

  return (
    <Button
      variant="text"
      size="small"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      onClick={onCycle}
      sx={{
        minWidth: 24,
        minHeight: 24,
        px: 0,
        py: 0,
        color: normalizedThinkingLevel === "off" ? "text.disabled" : "text.secondary",
      }}
    >
      <Box aria-hidden="true" sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.25, height: 12 }}>
          {BAR_HEIGHTS.map((barHeight, barIndex) => {
            const isActive = barIndex < activeBarCount;

            return (
              <Box
                key={barHeight}
                component="span"
                data-testid={`thinking-level-bar-${barIndex + 1}`}
                data-active={isActive}
                sx={{
                  width: 2,
                  height: barHeight,
                  borderRadius: 0.5,
                  bgcolor: isActive ? "text.secondary" : "action.disabledBackground",
                }}
              />
            );
          })}
        </Box>
        <Box component="span" sx={{ fontSize: 12, lineHeight: 1.5 }}>
          {thinkingLevelLabel}
        </Box>
      </Box>
    </Button>
  );
}
