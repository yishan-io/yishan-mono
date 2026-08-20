import { type RefCallback, useCallback, useEffect, useRef, useState } from "react";

/** Minimum viewer width that provides enough space for a side-by-side diff. */
export const DIFF_SPLIT_VIEW_MIN_WIDTH_PX = 960;

/** A supported presentation mode for a file diff. */
export type ResponsiveDiffViewMode = "split" | "unified";

/**
 * Resolves the default diff presentation mode for a viewer width.
 *
 * A viewer exactly at the minimum width uses split view.
 */
export function resolveResponsiveDiffViewMode(width: number): ResponsiveDiffViewMode {
  return width >= DIFF_SPLIT_VIEW_MIN_WIDTH_PX ? "split" : "unified";
}

/** State and root binding for a diff view that defaults according to its available width. */
export interface ResponsiveDiffViewModeState {
  rootRef: RefCallback<HTMLElement>;
  isSplitView: boolean;
  toggleDiffViewMode: () => void;
}

/**
 * Selects a default diff view mode from the bound root's width until the user selects a mode.
 *
 * Hidden zero-width measurements do not change the mode. The mode remains unified when
 * `ResizeObserver` is unavailable.
 */
export function useResponsiveDiffViewMode(): ResponsiveDiffViewModeState {
  const [isSplitView, setIsSplitView] = useState(false);
  const currentRootRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const hasExplicitModeRef = useRef(false);

  const updateModeFromRoot = useCallback((root: HTMLElement) => {
    const width = root.getBoundingClientRect().width;
    if (width === 0 || hasExplicitModeRef.current) {
      return;
    }

    setIsSplitView(resolveResponsiveDiffViewMode(width) === "split");
  }, []);

  const disconnectObserver = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const rootRef = useCallback(
    (root: HTMLElement | null) => {
      disconnectObserver();
      currentRootRef.current = root;

      if (!root || typeof ResizeObserver === "undefined") {
        return;
      }

      updateModeFromRoot(root);

      const observer = new ResizeObserver(() => {
        const currentRoot = currentRootRef.current;
        if (currentRoot) {
          updateModeFromRoot(currentRoot);
        }
      });
      observerRef.current = observer;
      observer.observe(root);
    },
    [disconnectObserver, updateModeFromRoot],
  );

  useEffect(() => disconnectObserver, [disconnectObserver]);

  const toggleDiffViewMode = useCallback(() => {
    hasExplicitModeRef.current = true;
    setIsSplitView((previousIsSplitView) => !previousIsSplitView);
  }, []);

  return { rootRef, isSplitView, toggleDiffViewMode };
}
