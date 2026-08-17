import { layoutStore } from "../../state/layoutStore";
import { splitPaneStore } from "../../state/splitPaneStore";

/**
 * Workbench read-only hooks — the stable read surface for Workbench Layout
 * State (Phase 17, desktop6.md). Cross-feature UI subscribes to layout state
 * through these hooks instead of importing the Workbench Store directly.
 */

/** Subscribes to the right workspace pane width. */
export function useRightPaneWidth(): number {
  return layoutStore((state) => state.rightWidth);
}

/** Subscribes to the left workspace pane width. */
export function useLeftPaneWidth(): number {
  return layoutStore((state) => state.leftWidth);
}

/** Subscribes to the split-pane layout of one workspace. */
export function useLayout(workspaceId: string) {
  return splitPaneStore((state) => state.layoutByWorkspaceId[workspaceId]);
}

/** Subscribes to the link-open target preference. */
export function useLinkTarget(): "built-in" | "external" {
  return layoutStore((state) => state.linkTarget);
}

/** Subscribes to the markdown theme preference. */
export function useMarkdownThemePreference(): "inherit" | "light" | "dark" {
  return layoutStore((state) => state.markdownThemePreference);
}

/** Subscribes to the markdown outline visibility. */
export function useIsMarkdownOutlineVisible(): boolean {
  return layoutStore((state) => state.isMarkdownOutlineVisible);
}

/** Subscribes to the markdown preview width. */
export function useMarkdownPreviewWidth(): "readable" | "full" {
  return layoutStore((state) => state.markdownPreviewWidth);
}

/** Subscribes to the markdown preview font size. */
export function useMarkdownPreviewFontSize(): "small" | "medium" | "large" {
  return layoutStore((state) => state.markdownPreviewFontSize);
}
