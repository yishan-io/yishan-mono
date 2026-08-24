import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;
const AUTOCOMPLETE_PAGE_SIZE = 5;

type AutocompleteOwnerState = {
  freeSolo?: boolean;
  handleHomeEndKeys?: boolean;
};

type VirtualizedListboxProps = React.HTMLAttributes<HTMLElement> & {
  ownerState?: AutocompleteOwnerState;
};

type OptionElementProps = {
  "aria-disabled"?: boolean | "true" | "false";
  "data-option-index"?: number;
  id?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
};

/**
 * Custom listbox component for MUI Autocomplete that virtualises its items
 * with @tanstack/react-virtual, keeping the DOM lean for large option sets.
 * The listbox remains the scroll owner and contains options directly.
 */
export const VirtualizedListbox = forwardRef<HTMLUListElement, VirtualizedListboxProps>(function VirtualizedListbox(
  { children, ownerState, ...rest },
  forwardedRef,
) {
  const items = useMemo(() => {
    const optionElements: React.ReactElement<OptionElementProps>[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement<OptionElementProps>(child)) optionElements.push(child);
    });
    return optionElements;
  }, [children]);
  const count = items.length;
  const [keyboardTargetIndex, setKeyboardTargetIndex] = useState<number | null>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const setListboxRef = useCallback(
    (listbox: HTMLUListElement | null) => {
      listboxRef.current = listbox;
      if (typeof forwardedRef === "function") forwardedRef(listbox);
      else if (forwardedRef) forwardedRef.current = listbox;
    },
    [forwardedRef],
  );

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => listboxRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  useLayoutEffect(() => {
    const listbox = listboxRef.current;
    if (!listbox) return;
    const inputId = listbox.id.replace(/-listbox$/, "");
    const input = inputId ? listbox.ownerDocument.getElementById(inputId) : null;
    if (!(input instanceof HTMLInputElement)) return;

    const getHighlightedIndex = () => {
      const activeDescendant = input.getAttribute("aria-activedescendant");
      return items.findIndex((option) => option.props.id === activeDescendant);
    };
    const scrollToIndex = (index: number) => {
      flushSync(() => {
        setKeyboardTargetIndex(index);
        virtualizer.scrollToIndex(index, { align: "auto" });
      });
    };
    const getNextEnabledIndex = (index: number, direction: 1 | -1) => {
      for (let attempt = 0; attempt < count; attempt += 1) {
        const nextIndex = (index + direction * attempt + count) % count;
        if (items[nextIndex]?.props["aria-disabled"] !== true && items[nextIndex]?.props["aria-disabled"] !== "true") {
          return nextIndex;
        }
      }
      return index;
    };
    const getKeyboardTargetIndex = (event: KeyboardEvent) => {
      const highlightedIndex = getHighlightedIndex();
      const currentIndex = highlightedIndex === -1 ? -1 : highlightedIndex;
      const shouldHandleHomeEndKeys = ownerState?.handleHomeEndKeys ?? !ownerState?.freeSolo;
      if ((event.key === "Home" || event.key === "End") && !shouldHandleHomeEndKeys) return null;
      if (event.key === "Home") return getNextEnabledIndex(0, 1);
      if (event.key === "End") return getNextEnabledIndex(count - 1, -1);
      if (event.key === "ArrowDown") return getNextEnabledIndex((highlightedIndex + 1 + count) % count, 1);
      if (event.key === "ArrowUp") {
        return getNextEnabledIndex(highlightedIndex === -1 ? count - 1 : highlightedIndex - 1, -1);
      }
      if (event.key === "PageDown") {
        return getNextEnabledIndex(Math.min(currentIndex + AUTOCOMPLETE_PAGE_SIZE, count - 1), 1);
      }
      if (event.key === "PageUp") return getNextEnabledIndex(Math.max(currentIndex - AUTOCOMPLETE_PAGE_SIZE, 0), -1);
      return null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (count === 0) return;
      const targetIndex = getKeyboardTargetIndex(event);
      if (targetIndex !== null) scrollToIndex(targetIndex);
    };
    const observer = new MutationObserver(() => {
      const highlightedIndex = getHighlightedIndex();
      if (highlightedIndex >= 0) scrollToIndex(highlightedIndex);
    });
    observer.observe(input, { attributes: true, attributeFilter: ["aria-activedescendant"] });
    input.addEventListener("keydown", handleKeyDown, true);
    return () => {
      observer.disconnect();
      input.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [count, items, ownerState?.freeSolo, ownerState?.handleHomeEndKeys, virtualizer]);

  const totalHeight = virtualizer.getTotalSize();
  const visibleHeight = Math.min(count, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;

  return (
    <Box
      component="ul"
      ref={setListboxRef}
      {...rest}
      sx={{
        p: 0,
        m: 0,
        height: visibleHeight,
        maxHeight: visibleHeight,
        minWidth: "max-content",
        overflow: "auto",
        position: "relative",
        listStyle: "none",
        "&::after": { content: '""', display: "block", height: totalHeight },
      }}
    >
      {[...virtualizer.getVirtualItems(), ...(keyboardTargetIndex === null ? [] : [{ index: keyboardTargetIndex }])]
        .filter(
          (virtualItem, index, virtualItems) =>
            virtualItems.findIndex((candidate) => candidate.index === virtualItem.index) === index,
        )
        .map((virtualItem) => {
          const option = items[virtualItem.index];
          if (!option) return null;
          const itemStart = "start" in virtualItem ? virtualItem.start : virtualItem.index * ITEM_HEIGHT;
          const itemSize = "size" in virtualItem ? virtualItem.size : ITEM_HEIGHT;
          return React.cloneElement(option, {
            style: {
              ...option.props.style,
              position: "absolute",
              top: itemStart,
              left: 0,
              width: "100%",
              minWidth: "max-content",
              height: itemSize,
              whiteSpace: "nowrap",
            },
          });
        })}
    </Box>
  );
});
