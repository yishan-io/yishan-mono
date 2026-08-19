import { Box, Button, Menu, MenuItem } from "@mui/material";
import { type MouseEvent, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { THINKING_LEVELS, type ThinkingLevel } from "../../providers/agentThinkingLevels";

type ThinkingLevelControlProps = {
  thinkingLevel: string;
  /** Called with the chosen level; unsupported levels are disabled in the menu. */
  onSelect: (level: string) => void;
  /** Supported levels for the current model; shown in the tooltip when present. */
  supportedLevels?: string[];
};

const ACTIVE_BAR_COUNTS: Record<string, number> = {
  off: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
};

const BAR_HEIGHTS = [4, 6, 8, 10, 12, 14];
export const THINKING_LEVEL_LABELS: Record<string, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};
const THINKING_LEVEL_BUTTON_LABEL_PREFIX = "Thinking level:";

function normalizeThinkingLevel(thinkingLevel: string): string {
  return Object.hasOwn(ACTIVE_BAR_COUNTS, thinkingLevel) ? thinkingLevel : "off";
}

/**
 * Displays the current thinking level as ascending bars and opens a menu to
 * pick a level directly. Levels the current model does not support are shown
 * disabled with a hint instead of being silently clamped on selection.
 */
export function ThinkingLevelControl({ thinkingLevel, onSelect, supportedLevels }: ThinkingLevelControlProps) {
  const normalizedThinkingLevel = normalizeThinkingLevel(thinkingLevel);
  const activeBarCount = ACTIVE_BAR_COUNTS[normalizedThinkingLevel] ?? 0;
  const thinkingLevelLabel = THINKING_LEVEL_LABELS[normalizedThinkingLevel] ?? THINKING_LEVEL_LABELS.off;
  const accessibleLabel = `${THINKING_LEVEL_BUTTON_LABEL_PREFIX} ${thinkingLevelLabel}`;
  const supportedLabel =
    supportedLevels && supportedLevels.length > 0 ? `\nSupported levels: ${supportedLevels.join(", ")}` : "";
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const handleOpenMenu = (event: MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };
  const handleCloseMenu = () => {
    setMenuAnchor(null);
  };
  const handleSelectLevel = (level: ThinkingLevel) => {
    handleCloseMenu();
    onSelect(level);
  };

  return (
    <>
      <Button
        variant="text"
        size="small"
        aria-label={accessibleLabel}
        aria-haspopup="menu"
        title={`${accessibleLabel}${supportedLabel}`}
        onClick={handleOpenMenu}
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
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
        aria-label="Thinking level options"
      >
        {THINKING_LEVELS.map((level) => {
          // Hide levels the current model cannot run; the dialog's warning
          // caption already explains a configured unsupported value.
          if (supportedLevels && !supportedLevels.includes(level)) {
            return null;
          }
          const isActive = level === normalizedThinkingLevel;

          return (
            <MenuItem
              key={level}
              selected={isActive}
              onClick={() => {
                handleSelectLevel(level);
              }}
            >
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                <Box component="span" aria-hidden="true" sx={{ display: "inline-flex", width: 14 }}>
                  {isActive ? <LuCheck size={14} /> : null}
                </Box>
                {THINKING_LEVEL_LABELS[level]}
              </Box>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
