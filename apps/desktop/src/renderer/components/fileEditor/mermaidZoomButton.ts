/**
 * Attaches a zoom/expand button to mermaid diagrams rendered inside Vditor's
 * IR DOM, mirroring the preview pane's expand affordance.
 *
 * Vditor renders each mermaid code block into a `.vditor-ir__preview` panel;
 * the rendered SVG replaces the innerHTML of the `.language-mermaid` code
 * element (marked `data-processed="true"` once rendered). Vditor recreates
 * these panels whenever the document re-renders (edits, theme switches), so a
 * MutationObserver re-attaches buttons to newly-created panels.
 *
 * The button lives inside the panel, shown on hover, and reports the current
 * SVG markup via the `onZoom` callback — the caller opens the shared
 * `DiagramZoomOverlay` with it.
 */

import { getErrorMessage } from "../../helpers/errorHelpers";
import { mermaidIframeRenderer } from "../markdown/mermaidIframeRenderer";

const ZOOM_BUTTON_CLASS = "vditor-mermaid-zoom-btn";
const ATTACHED_ATTR = "data-zoom-attached";

/** The maximize-2 icon (lucide), inlined so this helper stays DOM-only. */
const MAXIMIZE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

/** Returns the rendered mermaid SVG markup inside a preview panel, or null. */
function getRenderedMermaidSvg(panel: HTMLElement): string | null {
  const mermaidElement = panel.querySelector<HTMLElement>(".language-mermaid[data-processed='true']");
  const svg = mermaidElement?.querySelector("svg");
  return svg ? svg.outerHTML : null;
}

/** Creates the hover-revealed zoom button for one preview panel. */
function createZoomButton(
  panel: HTMLElement,
  onZoom: (svgContent: string) => void,
  expandLabel = "Expand diagram",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = ZOOM_BUTTON_CLASS;
  button.setAttribute("aria-label", expandLabel);
  button.title = expandLabel;
  button.innerHTML = MAXIMIZE_ICON_SVG;
  button.style.cssText = [
    "position:absolute",
    "top:4px",
    "right:4px",
    // NOTE: do NOT set opacity/transition inline — the hover-reveal rules in
    // vditorTheme.css (.vditor-mermaid-zoom-btn) must win over inline styles.
    "background:var(--vditor-app-surface, #ffffff)",
    "border:1px solid var(--vditor-app-border, rgba(0,0,0,0.15))",
    "border-radius:4px",
    "cursor:pointer",
    "padding:4px",
    "line-height:0",
    "z-index:2",
    "display:flex",
    "align-items:center",
    "justify-content:center",
  ].join(";");

  button.addEventListener("click", (event) => {
    // Keep the click away from Vditor's own panel handlers (focus/caret moves).
    event.preventDefault();
    event.stopPropagation();

    const svgContent = getRenderedMermaidSvg(panel);
    if (svgContent) {
      onZoom(svgContent);
    }
  });

  return button;
}

/** Scans the root for rendered mermaid panels missing a zoom button and attaches one. */
function scanAndAttach(root: HTMLElement, onZoom: (svgContent: string) => void, expandLabel: string): void {
  const panels = root.querySelectorAll<HTMLElement>(".vditor-ir__preview");
  for (const panel of panels) {
    if (panel.hasAttribute(ATTACHED_ATTR)) {
      continue;
    }
    if (!getRenderedMermaidSvg(panel)) {
      continue;
    }

    panel.setAttribute(ATTACHED_ATTR, "true");
    panel.appendChild(createZoomButton(panel, onZoom, expandLabel));
  }
}

/**
 * Watches the editor root and keeps one zoom button on every rendered mermaid
 * preview panel. Returns a cleanup function (disconnect the observer).
 */
export function attachMermaidZoomButtons(
  root: HTMLElement,
  onZoom: (svgContent: string) => void,
  options: { expandLabel?: string } = {},
): () => void {
  const expandLabel = options.expandLabel ?? "Expand diagram";
  scanAndAttach(root, onZoom, expandLabel);

  // Vditor re-creates preview panels on re-render; watch for new ones.
  const observer = new MutationObserver(() => {
    scanAndAttach(root, onZoom, expandLabel);
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
  };
}

export { ZOOM_BUTTON_CLASS, ATTACHED_ATTR, getRenderedMermaidSvg, createZoomButton };

// ---------------------------------------------------------------------------
// Theme re-render
// ---------------------------------------------------------------------------

/**
 * Re-renders every mermaid diagram in the editor with a new theme.
 *
 * Vditor's `setTheme` only toggles the `vditor--dark` class — diagrams already
 * rendered keep their original palette. Extract each diagram's source from its
 * marker `<pre>` and re-render the preview panel's SVG with the app's
 * off-main-thread `mermaidIframeRenderer` (same service the preview pane and
 * the zoom overlay use).
 */
export async function rethemeMermaidDiagrams(
  root: HTMLElement,
  options: { isDark: boolean; fontFamily?: string; onError?: (message: string) => void },
): Promise<void> {
  const codeBlocks = root.querySelectorAll<HTMLElement>('.vditor-ir__node[data-type="code-block"]');
  const tasks: Array<Promise<void>> = [];

  for (const block of codeBlocks) {
    const source = block.querySelector<HTMLElement>(".vditor-ir__marker--pre code.language-mermaid");
    const preview = block.querySelector<HTMLElement>(".vditor-ir__preview .language-mermaid");
    const code = source?.textContent?.trim();
    if (!source || !preview || !code) {
      continue;
    }

    tasks.push(
      mermaidIframeRenderer
        .render(code, { isDark: options.isDark, fontFamily: options.fontFamily ?? "" })
        .then((svg) => {
          preview.innerHTML = svg;
        })
        .catch((error: unknown) => {
          options.onError?.(getErrorMessage(error));
        }),
    );
  }

  await Promise.all(tasks);
}
