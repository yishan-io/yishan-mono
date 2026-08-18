import { ClickAwayListener, Popper } from "@mui/material";
import type { ReactNode, RefObject } from "react";
import { useEffect } from "react";
import { FloatingSurface } from "../../../../../ui/components/FloatingSurface";

type ComposerSuggestionMenuShellProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  widthPx: number;
  maxHeightPx: number;
  selectedItemRef: RefObject<HTMLElement | null>;
  /** Identity of the selected item; re-scrolls the selection into view when it changes. */
  selectedItemKey?: string;
  onClose: () => void;
  children: ReactNode;
};

/** Shared dropdown shell for composer suggestion menus (slash commands, file mentions). */
export function ComposerSuggestionMenuShell({
  anchorEl,
  open,
  widthPx,
  maxHeightPx,
  selectedItemRef,
  selectedItemKey,
  onClose,
  children,
}: ComposerSuggestionMenuShellProps) {
  useEffect(() => {
    if (!open || selectedItemKey === undefined) {
      return;
    }

    selectedItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, selectedItemKey, selectedItemRef]);

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      sx={{ zIndex: 1300, width: `${widthPx}px`, maxWidth: "calc(100vw - 32px)", mt: 0.5 }}
    >
      <ClickAwayListener
        onClickAway={(event) => {
          const clickTarget = event.target;
          if (anchorEl && clickTarget instanceof Node && anchorEl.contains(clickTarget)) {
            return;
          }
          onClose();
        }}
      >
        <FloatingSurface sx={{ p: 0.5, maxHeight: maxHeightPx, overflowY: "auto" }}>{children}</FloatingSurface>
      </ClickAwayListener>
    </Popper>
  );
}
