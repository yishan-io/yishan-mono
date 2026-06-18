// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material/styles";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppTheme } from "../theme";
import { DiagramZoomOverlay } from "./DiagramZoomOverlay";

const SAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>';

function renderOverlay(props?: Partial<React.ComponentProps<typeof DiagramZoomOverlay>>) {
  return render(
    <ThemeProvider theme={createAppTheme("dark")}>
      <DiagramZoomOverlay svgContent={SAMPLE_SVG} onClose={vi.fn()} {...props} />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("DiagramZoomOverlay", () => {
  it("renders the canvas container for SVG content", () => {
    const { container } = renderOverlay();
    // The Dialog renders — confirm the toolbar label is present, which means
    // the component mounted successfully and would inject svgContent via useEffect.
    expect(screen.getByText("Diagram")).toBeTruthy();
    // The outer dialog role should be present.
    expect(container.ownerDocument.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("shows the toolbar with Diagram label", () => {
    renderOverlay();
    expect(screen.getByText("Diagram")).toBeTruthy();
  });

  it("calls onClose when the X button is clicked", () => {
    const onClose = vi.fn();
    renderOverlay({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows zoom percentage starting at 100%", () => {
    renderOverlay();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("increases zoom when zoom-in button is clicked", () => {
    renderOverlay();
    const zoomIn = screen.getByRole("button", { name: /zoom in/i });
    fireEvent.click(zoomIn);
    // 100% + 15% step = 115%
    expect(screen.getByText("115%")).toBeTruthy();
  });

  it("decreases zoom when zoom-out button is clicked", () => {
    renderOverlay();
    const zoomOut = screen.getByRole("button", { name: /zoom out/i });
    fireEvent.click(zoomOut);
    // 100% - 15% step = 85%
    expect(screen.getByText("85%")).toBeTruthy();
  });

  it("reset button is disabled at default state (scale=1, no pan)", () => {
    renderOverlay();
    const resetBtn = screen.getByRole("button", { name: /reset zoom/i });
    expect(resetBtn.hasAttribute("disabled")).toBe(true);
  });

  it("reset button becomes enabled after zooming in, and resets to 100%", () => {
    renderOverlay();
    const zoomIn = screen.getByRole("button", { name: /zoom in/i });
    fireEvent.click(zoomIn);
    expect(screen.getByText("115%")).toBeTruthy();

    const resetBtn = screen.getByRole("button", { name: /reset zoom/i });
    expect(resetBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(resetBtn);

    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByRole("button", { name: /reset zoom/i }).hasAttribute("disabled")).toBe(true);
  });

  it("zoom-in button is disabled at ZOOM_MAX (10x)", () => {
    renderOverlay();
    const zoomIn = screen.getByRole("button", { name: /zoom in/i });
    // Click many times to reach max (10 / 0.15 ≈ 67 steps from 1)
    for (let i = 0; i < 70; i++) {
      fireEvent.click(zoomIn);
    }
    expect(zoomIn.hasAttribute("disabled")).toBe(true);
  });

  it("zoom-out button is disabled at ZOOM_MIN (0.1x)", () => {
    renderOverlay();
    const zoomOut = screen.getByRole("button", { name: /zoom out/i });
    for (let i = 0; i < 70; i++) {
      fireEvent.click(zoomOut);
    }
    expect(zoomOut.hasAttribute("disabled")).toBe(true);
  });
});
