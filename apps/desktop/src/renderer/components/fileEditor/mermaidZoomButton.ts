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
function createZoomButton(panel: HTMLElement, onZoom: (svgContent: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = ZOOM_BUTTON_CLASS;
  button.setAttribute("aria-label", "Expand diagram");
  button.title = "Expand diagram";
  button.innerHTML = MAXIMIZE_ICON_SVG;
  button.style.cssText = [
    "position:absolute",
    "top:4px",
    "right:4px",
    "opacity:0",
    "transition:opacity 0.15s",
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
function scanAndAttach(root: HTMLElement, onZoom: (svgContent: string) => void): void {
  const panels = root.querySelectorAll<HTMLElement>(".vditor-ir__preview");
  for (const panel of panels) {
    if (panel.hasAttribute(ATTACHED_ATTR)) {
      continue;
    }
    if (!getRenderedMermaidSvg(panel)) {
      continue;
    }

    panel.setAttribute(ATTACHED_ATTR, "true");
    panel.appendChild(createZoomButton(panel, onZoom));
  }
}

/**
 * Watches the editor root and keeps one zoom button on every rendered mermaid
 * preview panel. Returns a cleanup function (disconnect the observer).
 */
export function attachMermaidZoomButtons(
  root: HTMLElement,
  onZoom: (svgContent: string) => void,
): () => void {
  scanAndAttach(root, onZoom);

  // Vditor re-creates preview panels on re-render; watch for new ones.
  const observer = new MutationObserver(() => {
    scanAndAttach(root, onZoom);
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
  };
}

export { ZOOM_BUTTON_CLASS, ATTACHED_ATTR, getRenderedMermaidSvg, createZoomButton };
