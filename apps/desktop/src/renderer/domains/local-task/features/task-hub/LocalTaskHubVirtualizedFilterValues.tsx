import { MenuList } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cloneElement, useCallback, useEffect, useRef } from "react";

const FILTER_VALUE_HEIGHT = 36;
const MAX_VISIBLE_FILTER_VALUES = 8;

type FilterValueElementProps = {
  onFocus?: React.FocusEventHandler<HTMLElement>;
  style?: React.CSSProperties;
} & React.RefAttributes<HTMLElement>;

type FilterValueElement = React.ReactElement<FilterValueElementProps>;

type LocalTaskHubVirtualizedFilterValuesProps<Option> = {
  options: readonly Option[];
  renderOption: (option: Option) => FilterValueElement;
  autoFocusItem?: boolean;
};

/** Renders a bounded, keyboard-navigable menu of Task Hub filter values. */
export function LocalTaskHubVirtualizedFilterValues<Option>({
  options,
  renderOption,
  autoFocusItem = true,
}: LocalTaskHubVirtualizedFilterValuesProps<Option>) {
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef(new Map<number, HTMLElement>());
  const pendingFocusIndexRef = useRef<number | null>(null);
  const activeIndexRef = useRef(0);
  const virtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => FILTER_VALUE_HEIGHT,
    overscan: 5,
  });
  const visibleHeight = Math.min(options.length, MAX_VISIBLE_FILTER_VALUES) * FILTER_VALUE_HEIGHT;

  useEffect(() => {
    activeIndexRef.current = Math.min(activeIndexRef.current, Math.max(options.length - 1, 0));
  }, [options.length]);

  const focusOptionAtIndex = useCallback(
    (index: number) => {
      pendingFocusIndexRef.current = index;
      activeIndexRef.current = index;
      const targetOffset = index * FILTER_VALUE_HEIGHT;
      virtualizer.scrollToOffset(targetOffset);
      listRef.current?.scrollTo({ top: targetOffset });
      requestAnimationFrame(() => {
        if (pendingFocusIndexRef.current !== index) return;
        optionRefs.current.get(index)?.focus();
        pendingFocusIndexRef.current = null;
      });
    },
    [virtualizer],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (options.length === 0) return;
      const targetIndex =
        event.key === "ArrowDown"
          ? Math.min(activeIndexRef.current + 1, options.length - 1)
          : event.key === "ArrowUp"
            ? Math.max(activeIndexRef.current - 1, 0)
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? options.length - 1
                : null;
      if (targetIndex === null) return;

      event.preventDefault();
      event.stopPropagation();
      focusOptionAtIndex(targetIndex);
    },
    [focusOptionAtIndex, options.length],
  );
  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement) return;
    listElement.addEventListener("keydown", handleKeyDown, true);
    return () => listElement.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  const handleOptionRef = useCallback((index: number, element: HTMLElement | null) => {
    if (!element) {
      optionRefs.current.delete(index);
      return;
    }
    optionRefs.current.set(index, element);
    if (pendingFocusIndexRef.current === index) {
      element.focus();
      pendingFocusIndexRef.current = null;
    }
  }, []);

  return (
    <MenuList
      ref={listRef}
      autoFocusItem={autoFocusItem}
      sx={{
        height: visibleHeight,
        maxHeight: "calc(100vh - 120px)",
        m: 0,
        p: 0,
        overflowY: "auto",
        position: "relative",
        "&::after": { content: '""', display: "block", height: virtualizer.getTotalSize() },
      }}
    >
      {virtualizer.getVirtualItems().map((virtualOption) => {
        const option = options[virtualOption.index];
        if (!option) return null;
        const optionElement = renderOption(option);
        return cloneElement(optionElement, {
          key: virtualOption.key,
          ref: (element: HTMLElement | null) => handleOptionRef(virtualOption.index, element),
          onFocus: (event: React.FocusEvent<HTMLElement>) => {
            optionElement.props.onFocus?.(event);
            activeIndexRef.current = virtualOption.index;
          },
          style: {
            ...optionElement.props.style,
            position: "absolute",
            top: virtualOption.start,
            left: 0,
            width: "100%",
            height: virtualOption.size,
          },
        });
      })}
    </MenuList>
  );
}
