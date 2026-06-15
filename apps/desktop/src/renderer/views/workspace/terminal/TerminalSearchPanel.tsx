import { IconButton, InputBase, Portal, Stack } from "@mui/material";
import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";

type TerminalSearchPanelProps = {
  anchorRef: RefObject<HTMLElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchPrevious: () => void;
  onSearchNext: () => void;
  onClose: () => void;
};

export function TerminalSearchPanel({
  anchorRef,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchPrevious,
  onSearchNext,
  onClose,
}: TerminalSearchPanelProps) {
  const isSearchDisabled = searchQuery.trim().length === 0;
  const [position, setPosition] = useState({ top: 8, left: 8 });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const updatePosition = (): void => {
      const rect = anchor.getBoundingClientRect();
      setPosition({
        top: rect.top + 8,
        left: rect.right - 12,
      });
    };

    updatePosition();

    const resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });
    resizeObserver.observe(anchor);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  return (
    <Portal>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: "fixed",
          top: position.top,
          left: position.left,
          transform: "translateX(-100%)",
          alignItems: "center",
          px: 1,
          py: 0.5,
          border: "1px solid #414754",
          borderRadius: 1,
          bgcolor: "#31363f",
          zIndex: (theme) => theme.zIndex.modal,
        }}
      >
        <InputBase
          inputRef={searchInputRef}
          value={searchQuery}
          onChange={(event) => {
            onSearchQueryChange(event.target.value);
          }}
          placeholder="Find"
          slotProps={{
            input: {
              "aria-label": "Search terminal output",
            },
          }}
          sx={{
            width: 220,
            px: 0.75,
            py: 0.25,
            border: "1px solid #414754",
            borderRadius: 0.75,
            color: "#e7ebf0",
            fontSize: 13,
          }}
        />
        <IconButton
          aria-label="Previous terminal match"
          size="small"
          disabled={isSearchDisabled}
          onClick={onSearchPrevious}
          sx={{
            color: "#e7ebf0",
            fontSize: 11,
            "&.Mui-disabled": {
              color: "#8b8b8b",
            },
          }}
        >
          Prev
        </IconButton>
        <IconButton
          aria-label="Next terminal match"
          size="small"
          disabled={isSearchDisabled}
          onClick={onSearchNext}
          sx={{
            color: "#e7ebf0",
            fontSize: 11,
            "&.Mui-disabled": {
              color: "#8b8b8b",
            },
          }}
        >
          Next
        </IconButton>
        <IconButton
          aria-label="Close terminal search"
          size="small"
          onClick={onClose}
          sx={{ color: "#e7ebf0", fontSize: 11 }}
        >
          Close
        </IconButton>
      </Stack>
    </Portal>
  );
}
