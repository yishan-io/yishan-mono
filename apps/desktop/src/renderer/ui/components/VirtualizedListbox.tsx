import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { forwardRef, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;

type OptionElementProps = {
  id?: string;
  style?: React.CSSProperties;
};

/**
 * Custom listbox component for MUI Autocomplete that virtualises its items
 * with @tanstack/react-virtual, keeping the DOM lean for large option sets.
 * The listbox remains the scroll owner and contains options directly.
 */
export const VirtualizedListbox = forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLElement>>(
  function VirtualizedListbox({ children, ...rest }, forwardedRef) {
    const items = useMemo(() => {
      const optionElements: React.ReactElement<OptionElementProps>[] = [];
      React.Children.forEach(children, (child) => {
        if (React.isValidElement<OptionElementProps>(child)) optionElements.push(child);
      });
      return optionElements;
    }, [children]);
    const count = items.length;
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
      if (!input) return;

      const getHighlightedIndex = () => {
        const activeDescendant = input.getAttribute("aria-activedescendant");
        return items.findIndex((option) => option.props.id === activeDescendant);
      };
      const scrollToHighlightedOption = () => {
        const highlightedIndex = getHighlightedIndex();
        if (highlightedIndex >= 0) virtualizer.scrollToIndex(highlightedIndex, { align: "auto" });
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const highlightedIndex = getHighlightedIndex();
        const nextIndex = highlightedIndex + (event.key === "ArrowDown" ? 1 : -1);
        if (nextIndex < 0 || nextIndex >= count) return;
        flushSync(() => virtualizer.scrollToIndex(nextIndex, { align: "auto" }));
      };
      const observer = new MutationObserver(scrollToHighlightedOption);
      observer.observe(input, { attributes: true, attributeFilter: ["aria-activedescendant"] });
      input.addEventListener("keydown", handleKeyDown, true);
      return () => {
        observer.disconnect();
        input.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [count, items, virtualizer]);

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
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const option = items[virtualItem.index];
          if (!option) return null;
          return React.cloneElement(option, {
            style: {
              ...option.props.style,
              position: "absolute",
              top: virtualItem.start,
              left: 0,
              width: "100%",
              minWidth: "max-content",
              height: virtualItem.size,
              whiteSpace: "nowrap",
            },
          });
        })}
      </Box>
    );
  },
);
