import { Box, IconButton, InputBase, Typography, useTheme } from "@mui/material";
import type React from "react";
import { useEffect, useRef } from "react";
import { LuChevronDown, LuChevronUp, LuX } from "react-icons/lu";

type MarkdownFindBarProps = {
  query: string;
  activeIndex: number;
  matchCount: number;
  onQueryChange?: (q: string) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onClose?: () => void;
};

/** Find bar styled to match Monaco's built-in find widget.
 *  Rendered above the scroll container so it always stays visible. */
export function MarkdownFindBar({
  query,
  activeIndex,
  matchCount,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: MarkdownFindBarProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const inputRef = useRef<HTMLInputElement>(null);

  // Editor surface colors — match Monaco's find widget background.
  const bgColor = isDark ? "#292e36" : "#ffffff";
  const borderColor = isDark ? "#4a5160" : "#dfe3e8";
  const inputBgColor = isDark ? "#1e222a" : "#f5f6f8";

  // Auto-focus the input when the bar opens.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        onPrev?.();
      } else {
        onNext?.();
      }
    }
  };

  const matchLabel = matchCount === 0 ? "No results" : `${activeIndex + 1} of ${matchCount}`;

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        bgcolor: bgColor,
        borderLeft: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderRadius: "0 0 0 2px",
        gap: 0,
        px: 0.5,
        py: 0.375,
      }}
    >
      {/* Input */}
      <InputBase
        inputRef={inputRef}
        value={query}
        onChange={(e) => onQueryChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        sx={{
          fontSize: 13,
          fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
          color: "text.primary",
          px: 0.75,
          py: 0.25,
          bgcolor: inputBgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: "2px",
          width: 220,
          "& input": { p: 0 },
          "& input::placeholder": { color: "text.disabled", opacity: 1 },
        }}
        inputProps={{ "aria-label": "Find in preview" }}
      />

      {/* Match counter — only shown while a query is active */}
      {query && (
        <Typography
          variant="caption"
          sx={{
            fontSize: 11,
            fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
            color: matchCount === 0 ? "error.main" : "text.secondary",
            userSelect: "none",
            px: 0.75,
            whiteSpace: "nowrap",
          }}
        >
          {matchLabel}
        </Typography>
      )}

      <Box sx={{ width: "1px", height: 16, bgcolor: borderColor, flexShrink: 0, mx: 0.25 }} />

      <IconButton
        onClick={onPrev}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        sx={{ borderRadius: 0, p: 0.5, color: "text.secondary" }}
      >
        <LuChevronUp size={14} />
      </IconButton>
      <IconButton
        onClick={onNext}
        aria-label="Next match"
        title="Next match (Enter)"
        sx={{ borderRadius: 0, p: 0.5, color: "text.secondary" }}
      >
        <LuChevronDown size={14} />
      </IconButton>
      <IconButton
        onClick={onClose}
        aria-label="Close find bar"
        title="Close (Escape)"
        sx={{ borderRadius: 0, p: 0.5, color: "text.secondary" }}
      >
        <LuX size={14} />
      </IconButton>
    </Box>
  );
}
