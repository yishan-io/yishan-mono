import { useVirtualizer } from "@tanstack/react-virtual";
import React, { forwardRef, useRef } from "react";

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;

/**
 * Custom listbox component for MUI Autocomplete that virtualises its items
 * with @tanstack/react-virtual, keeping the DOM lean for large option sets.
 */
export const VirtualizedListbox = forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLElement>>(
  function VirtualizedListbox({ children, ...rest }, ref) {
    const items = React.Children.toArray(children);
    const count = items.length;
    const containerRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
      count,
      getScrollElement: () => containerRef.current,
      estimateSize: () => ITEM_HEIGHT,
      overscan: 5,
    });

    const totalHeight = virtualizer.getTotalSize();
    const visibleHeight = Math.min(count, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;

    return (
      <ul ref={ref} {...rest} style={{ ...rest.style, padding: 0, margin: 0, listStyle: "none" }}>
        <div ref={containerRef} style={{ overflow: "auto", maxHeight: visibleHeight }}>
          <div style={{ height: totalHeight, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualItem) => (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualItem.size,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {items[virtualItem.index]}
              </div>
            ))}
          </div>
        </div>
      </ul>
    );
  },
);
