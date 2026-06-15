import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { PaneLeaf, SplitPaneNode } from "../../store/split-pane";
import { collectPaneLeaves } from "./workspaceSplitPaneHelpers";

export type WorkspaceTabPlacement = {
  paneId: string;
  selected: boolean;
  activePane: boolean;
  rect: { left: number; top: number; width: number; height: number } | null;
};

/** Tracks pane content placeholders and derives tab placements for the portal overlay layer. */
export function useWorkspaceTabPlacements(input: {
  splitRoot: SplitPaneNode | null | undefined;
  activePaneId: string;
}) {
  const { splitRoot, activePaneId } = input;
  const [panePlaceholders, setPanePlaceholders] = useState<Record<string, HTMLDivElement | null>>({});
  const [layoutVersion, setLayoutVersion] = useState(0);

  const handleContentPlaceholderChange = useCallback((paneId: string, placeholder: HTMLDivElement | null) => {
    setPanePlaceholders((prev) => (prev[paneId] === placeholder ? prev : { ...prev, [paneId]: placeholder }));
  }, []);

  const tabPlacements = useMemo(() => {
    void layoutVersion;
    const placements = new Map<string, WorkspaceTabPlacement>();
    if (!splitRoot) {
      return placements;
    }
    const leaves = collectPaneLeaves(splitRoot);
    for (const pane of leaves) {
      const placeholder = panePlaceholders[pane.id];
      let rect: WorkspaceTabPlacement["rect"] = null;
      if (placeholder) {
        const bounds = placeholder.getBoundingClientRect();
        rect = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
      }
      for (const tabId of pane.tabIds) {
        placements.set(tabId, {
          paneId: pane.id,
          selected: tabId === pane.selectedTabId,
          activePane: pane.id === activePaneId,
          rect,
        });
      }
    }
    return placements;
  }, [splitRoot, panePlaceholders, layoutVersion, activePaneId]);

  useLayoutEffect(() => {
    const observedElements = Object.values(panePlaceholders).filter(
      (element): element is HTMLDivElement => element != null,
    );
    if (observedElements.length === 0 || typeof ResizeObserver !== "function") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      setLayoutVersion((version) => version + 1);
    });

    for (const element of observedElements) {
      resizeObserver.observe(element);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [panePlaceholders]);

  return {
    tabPlacements,
    handleContentPlaceholderChange,
  };
}
