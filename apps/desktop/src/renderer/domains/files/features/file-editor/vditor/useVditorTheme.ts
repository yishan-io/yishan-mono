import { type RefObject, useEffect, useRef } from "react";
import { rethemeMermaidDiagrams } from "./mermaidZoomButton";
import type { VditorEditorHandle } from "./vditorEditor";

type UseVditorThemeInput = {
  rootRef: RefObject<HTMLDivElement | null>;
  handleRef: RefObject<VditorEditorHandle | null>;
  resolvedIsDark: boolean;
};

/**
 * Applies the resolved dark/light theme to the Vditor shell and re-renders
 * already-rendered mermaid diagrams with the new palette.
 *
 * Vditor's own theme is set at construction (classic/dark). The root
 * data-theme attribute drives CSS custom-property overrides in
 * vditorTheme.css, which are authoritative for the app's design tokens.
 * setTheme toggles the vditor--dark class and swaps the hljs stylesheet.
 */
export function useVditorTheme({ rootRef, handleRef, resolvedIsDark }: UseVditorThemeInput) {
  const prevIsDarkRef = useRef(resolvedIsDark);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.setAttribute("data-theme", resolvedIsDark ? "dark" : "light");
    // Swap both vditor's shell theme and its syntax-highlight stylesheet
    // (github / github-dark) so existing code blocks re-color immediately.
    handleRef.current?.vditor.setTheme(
      resolvedIsDark ? "dark" : "classic",
      undefined,
      resolvedIsDark ? "github-dark" : "github",
    );

    const themeChanged = prevIsDarkRef.current !== resolvedIsDark;
    prevIsDarkRef.current = resolvedIsDark;
    if (themeChanged) {
      void rethemeMermaidDiagrams(root, {
        isDark: resolvedIsDark,
        fontFamily: getComputedStyle(root).fontFamily,
        onError: (message) => console.error("[VditorFileEditor] mermaid re-theme failed:", message),
      });
    }
  }, [handleRef, resolvedIsDark, rootRef]);
}
