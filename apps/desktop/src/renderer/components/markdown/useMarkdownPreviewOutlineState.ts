import { useCallback, useEffect, useState } from "react";
import type { MarkdownOutlineData } from "./markdownOutlineTree";

/** Tracks active and collapsed markdown outline state for the current render. */
export function useMarkdownPreviewOutlineState(outlineData: MarkdownOutlineData) {
  const [collapsedOutlineIds, setCollapsedOutlineIds] = useState<Set<string>>(new Set());
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);

  useEffect(() => {
    const entryIds = new Set(outlineData.entries.map((entry) => entry.id));
    setCollapsedOutlineIds((previous) => new Set(Array.from(previous).filter((id) => entryIds.has(id))));
    setActiveOutlineId((previous) =>
      previous && entryIds.has(previous) ? previous : (outlineData.entries[0]?.id ?? null),
    );
  }, [outlineData]);

  const handleToggleOutlineCollapse = useCallback((id: string) => {
    setCollapsedOutlineIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectOutlineItem = useCallback(
    (id: string) => {
      const entry = outlineData.entries.find((candidate) => candidate.id === id);
      if (!entry) {
        return;
      }

      setActiveOutlineId(id);
      entry.element.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [outlineData.entries],
  );

  return {
    collapsedOutlineIds,
    activeOutlineId,
    handleToggleOutlineCollapse,
    handleSelectOutlineItem,
  };
}
