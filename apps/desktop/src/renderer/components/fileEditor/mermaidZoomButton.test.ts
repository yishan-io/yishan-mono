/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ATTACHED_ATTR, ZOOM_BUTTON_CLASS, attachMermaidZoomButtons, getRenderedMermaidSvg } from "./mermaidZoomButton";

/** Builds a fake Vditor IR code-block preview panel with a rendered mermaid. */
function buildMermaidPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "vditor-ir__preview";
  const code = document.createElement("code");
  code.className = "language-mermaid";
  code.setAttribute("data-processed", "true");
  code.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="red"/></svg>';
  panel.appendChild(code);
  return panel;
}

describe("mermaidZoomButton", () => {
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

    button?.click();
    expect(onZoom).toHaveBeenCalledTimes(1);
    const svgArg = onZoom.mock.calls[0]![0] as string;
    expect(svgArg).toContain("<svg");
    expect(svgArg).toContain("fill=\"red\"");
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
});
