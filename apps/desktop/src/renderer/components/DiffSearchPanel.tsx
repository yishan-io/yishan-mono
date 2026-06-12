import { Box, IconButton, InputBase, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useRef } from "react";
import { LuArrowDown, LuArrowUp, LuSearch, LuX } from "react-icons/lu";

type DiffSearchPanelProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  matchCount: number;
  currentMatchIndex: number;
  autoFocus?: boolean;
};

export function DiffSearchPanel({
  query,
  onQueryChange,
  onPrevious,
  onNext,
  onClose,
  matchCount,
  currentMatchIndex,
  autoFocus,
}: DiffSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [autoFocus]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
          onPrevious();
        } else {
          onNext();
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onPrevious, onNext, onClose],
  );

  const hasMatch = matchCount > 0;
  const matchLabel = hasMatch ? `${currentMatchIndex + 1} of ${matchCount}` : query ? "No results" : "";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderBottom: 1,
        borderColor: "divider",
        flexShrink: 0,
        minHeight: 36,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
        <LuSearch size={13} style={{ marginRight: 4, flexShrink: 0, opacity: 0.5 }} />
        <InputBase
          inputRef={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in diff"
          sx={{ fontSize: 13, flex: 1 }}
          inputProps={{ "aria-label": "Find in diff" }}
        />
      </Box>

      {matchLabel && (
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontSize: 11 }}>
          {matchLabel}
        </Typography>
      )}

      <Tooltip title="Previous match (Shift+Enter)">
        <Box component="span">
          <IconButton size="small" onClick={onPrevious} disabled={!hasMatch}>
            <LuArrowUp size={13} />
          </IconButton>
        </Box>
      </Tooltip>

      <Tooltip title="Next match (Enter)">
        <Box component="span">
          <IconButton size="small" onClick={onNext} disabled={!hasMatch}>
            <LuArrowDown size={13} />
          </IconButton>
        </Box>
      </Tooltip>

      <Tooltip title="Close (Escape)">
        <IconButton size="small" onClick={onClose}>
          <LuX size={13} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
