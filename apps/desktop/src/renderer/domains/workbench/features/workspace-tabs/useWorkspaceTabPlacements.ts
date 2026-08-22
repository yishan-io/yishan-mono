import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SplitPaneNode } from "../../../../domains/workbench/split-pane";
import { collectPaneLeaves } from "./workspaceSplitPane";

type PaneRect = { left: number; top: number; width: number; height: number };

export type WorkspaceTabPlacement = {
  paneId: string;
  selected: boolean;
  activePane: boolean;
  rect: PaneRect | null;
};

function getPaneRect(element: HTMLDivElement): PaneRect {
  const bounds = element.getBoundingClientRect();
  return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
}

function arePaneRectsEqual(left: PaneRect, right: PaneRect): boolean {
  return (
    left.left === right.left && left.top === right.top && left.width === right.width && left.height === right.height
  );
}

/** Tracks pane content placeholders and derives tab placements for the portal overlay layer. */
export function useWorkspaceTabPlacements(input: {
  splitRoot: SplitPaneNode | null | undefined;
  activePaneId: string;
}) {
  const { splitRoot, activePaneId } = input;
  const [panePlaceholders, setPanePlaceholders] = useState<Record<string, HTMLDivElement | null>>({});
  const [layoutVersion, setLayoutVersion] = useState(0);
  const observedRectByPaneIdRef = useRef<Record<string, PaneRect>>({});

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
      const rect = placeholder ? getPaneRect(placeholder) : null;
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

    const paneIdByElement = new Map<HTMLDivElement, string>();
    const observedRectByPaneId: Record<string, PaneRect> = {};
    for (const [paneId, element] of Object.entries(panePlaceholders)) {
      if (!element) {
        continue;
      }
      paneIdByElement.set(element, paneId);
      observedRectByPaneId[paneId] = getPaneRect(element);
    }
    observedRectByPaneIdRef.current = observedRectByPaneId;

    const resizeObserver = new ResizeObserver((entries) => {
      let hasGeometryChanged = false;
      for (const entry of entries) {
        const paneId = paneIdByElement.get(entry.target as HTMLDivElement);
        if (!paneId) {
          continue;
        }
        const nextRect = getPaneRect(entry.target as HTMLDivElement);
        const previousRect = observedRectByPaneIdRef.current[paneId];
        if (previousRect && arePaneRectsEqual(previousRect, nextRect)) {
          continue;
        }
        observedRectByPaneIdRef.current[paneId] = nextRect;
        hasGeometryChanged = true;
      }
      if (hasGeometryChanged) {
        setLayoutVersion((version) => version + 1);
      }
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
