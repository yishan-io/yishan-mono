/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTACHED_ATTR,
  ZOOM_BUTTON_CLASS,
  attachMermaidZoomButtons,
  getRenderedMermaidSvg,
  rethemeMermaidDiagrams,
} from "./mermaidZoomButton";

vi.mock("../../ui/markdown/mermaidIframeRenderer", () => ({
  mermaidIframeRenderer: {
    render: vi
      .fn()
      .mockResolvedValue(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="darkblue"/></svg>',
      ),
  },
}));

import { mermaidIframeRenderer } from "../../ui/markdown/mermaidIframeRenderer";

/** Builds a fake Vditor IR code-block preview panel with a rendered mermaid. */
function buildMermaidPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "vditor-ir__preview";
  const code = document.createElement("code");
  code.className = "language-mermaid";
  code.setAttribute("data-processed", "true");
  code.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>';
  panel.appendChild(code);
  return panel;
}

describe("mermaidZoomButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("attaches one zoom button to a rendered mermaid panel and reports its SVG on click", () => {
    const root = document.createElement("div");
    const panel = buildMermaidPanel();
    root.appendChild(panel);
    document.body.appendChild(root);

    const onZoom = vi.fn();
    attachMermaidZoomButtons(root, onZoom);

    const button = panel.querySelector<HTMLButtonElement>(`.${ZOOM_BUTTON_CLASS}`);
    expect(button).not.toBeNull();
    expect(panel.getAttribute(ATTACHED_ATTR)).toBe("true");
    // Opacity must NOT be inline — the stylesheet hover rule is what reveals
    // the button (an inline opacity: 0 would beat the :hover rule forever).
    expect(button?.style.opacity).toBe("");

    button?.click();
    expect(onZoom).toHaveBeenCalledTimes(1);
    const svgArg = onZoom.mock.calls[0]?.[0] as string;
    expect(svgArg).toContain("<svg");
    expect(svgArg).toContain('fill="red"');
  });

  it("does not attach to unrendered or non-mermaid panels", () => {
    const root = document.createElement("div");

    // Unrendered mermaid (no data-processed yet — Vditor still loading the CDN script).
    const unprocessed = document.createElement("div");
    unprocessed.className = "vditor-ir__preview";
    const codeEl = document.createElement("code");
    codeEl.className = "language-mermaid";
    codeEl.textContent = "graph LR; A-->B";
    unprocessed.appendChild(codeEl);

    // Plain (non-mermaid) code preview.
    const plain = document.createElement("div");
    plain.className = "vditor-ir__preview";
    const jsCode = document.createElement("code");
    jsCode.className = "language-javascript";
    jsCode.setAttribute("data-processed", "true");
    jsCode.textContent = "const a = 1;";
    plain.appendChild(jsCode);

    root.append(unprocessed, plain);
    document.body.appendChild(root);

    const onZoom = vi.fn();
    attachMermaidZoomButtons(root, onZoom);

    expect(unprocessed.querySelector(`.${ZOOM_BUTTON_CLASS}`)).toBeNull();
    expect(plain.querySelector(`.${ZOOM_BUTTON_CLASS}`)).toBeNull();
    expect(onZoom).not.toHaveBeenCalled();
  });

  it("re-attaches to panels Vditor re-creates after a re-render", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const onZoom = vi.fn();
    attachMermaidZoomButtons(root, onZoom);

    // Vditor re-renders: a brand-new panel appears (old one is discarded).
    const panel = buildMermaidPanel();
    root.appendChild(panel);

    // MutationObserver callback is async (microtask).
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const button = panel.querySelector<HTMLButtonElement>(`.${ZOOM_BUTTON_CLASS}`);
        expect(button).not.toBeNull();
        button?.click();
        expect(onZoom).toHaveBeenCalledTimes(1);
        resolve();
      }, 0);
    });
  });

  it("does not duplicate buttons when the same panel is scanned again", () => {
    const root = document.createElement("div");
    const panel = buildMermaidPanel();
    root.appendChild(panel);
    document.body.appendChild(root);

    const onZoom = vi.fn();
    attachMermaidZoomButtons(root, onZoom);
    // Simulate the observer firing again over the same DOM.
    root.appendChild(document.createElement("span"));
    root.appendChild(document.createElement("span"));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(panel.querySelectorAll(`.${ZOOM_BUTTON_CLASS}`).length).toBe(1);
        resolve();
      }, 0);
    });
  });

  it("getRenderedMermaidSvg returns null when no rendered svg is present", () => {
    const panel = buildMermaidPanel();
    panel.querySelector(".language-mermaid")?.removeAttribute("data-processed");
    expect(getRenderedMermaidSvg(panel)).toBeNull();
  });

  // ── Theme re-render ──

  it("re-renders mermaid previews with the new theme and source from the marker pre", async () => {
    const root = document.createElement("div");
    const block = document.createElement("div");
    block.className = "vditor-ir__node";
    block.setAttribute("data-type", "code-block");
    const source = document.createElement("pre");
    source.className = "vditor-ir__marker--pre";
    const sourceCode = document.createElement("code");
    sourceCode.className = "language-mermaid";
    sourceCode.textContent = "graph LR; A-->B";
    source.appendChild(sourceCode);
    const preview = document.createElement("div");
    preview.className = "vditor-ir__preview";
    const previewCode = document.createElement("code");
    previewCode.className = "language-mermaid";
    previewCode.setAttribute("data-processed", "true");
    previewCode.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="lightgray"/></svg>';
    preview.appendChild(previewCode);
    block.append(source, preview);
    root.appendChild(block);

    const onError = vi.fn();
    await rethemeMermaidDiagrams(root, { isDark: true, fontFamily: "sans-serif", onError });

    expect(mermaidIframeRenderer.render).toHaveBeenCalledWith("graph LR; A-->B", {
      isDark: true,
      fontFamily: "sans-serif",
    });
    expect(previewCode.innerHTML).toContain('fill="darkblue"');
    expect(onError).not.toHaveBeenCalled();
  });

  it("skips blocks without a mermaid source or preview", async () => {
    const root = document.createElement("div");
    const block = document.createElement("div");
    block.className = "vditor-ir__node";
    block.setAttribute("data-type", "code-block");
    // javascript code block — no mermaid
    const source = document.createElement("pre");
    source.className = "vditor-ir__marker--pre";
    const sourceCode = document.createElement("code");
    sourceCode.className = "language-javascript";
    sourceCode.textContent = "const a = 1;";
    source.appendChild(sourceCode);
    block.appendChild(source);
    root.appendChild(block);

    await rethemeMermaidDiagrams(root, { isDark: true });

    expect(mermaidIframeRenderer.render).not.toHaveBeenCalled();
  });

  it("reports render failures via onError without throwing", async () => {
    vi.mocked(mermaidIframeRenderer.render).mockRejectedValueOnce(new Error("render exploded"));

    const root = document.createElement("div");
    const block = document.createElement("div");
    block.className = "vditor-ir__node";
    block.setAttribute("data-type", "code-block");
    const source = document.createElement("pre");
    source.className = "vditor-ir__marker--pre";
    const sourceCode = document.createElement("code");
    sourceCode.className = "language-mermaid";
    sourceCode.textContent = "graph LR; A-->B";
    source.appendChild(sourceCode);
    const preview = document.createElement("div");
    preview.className = "vditor-ir__preview";
    const previewCode = document.createElement("code");
    previewCode.className = "language-mermaid";
    previewCode.setAttribute("data-processed", "true");
    previewCode.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="lightgray"/></svg>';
    preview.appendChild(previewCode);
    block.append(source, preview);
    root.appendChild(block);

    const onError = vi.fn();
    await expect(rethemeMermaidDiagrams(root, { isDark: true, onError })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith("render exploded");
    // Original svg left untouched on failure.
    expect(previewCode.innerHTML).toContain('fill="lightgray"');
  });
});
