// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material/styles";
import { layoutStore } from "@renderer/store/settings/layoutStore";
import { createAppTheme } from "@renderer/theme";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";
import { MarkdownPreviewThemeProvider } from "./MarkdownPreviewThemeProvider";

const parseMock = vi.fn<(content: string) => Promise<string>>();

vi.mock("./markdownService", () => ({
  markdownService: {
    parse: (content: string) => parseMock(content),
  },
}));

describe("MarkdownPreview outline", () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    layoutStore.setState({ isMarkdownOutlineVisible: true, markdownThemePreference: "inherit" });
    parseMock.mockResolvedValue(`
      <h1>Intro</h1>
      <p>Start</p>
      <h2>Setup</h2>
      <h3>Install</h3>
      <h2>Usage</h2>
    `);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    layoutStore.setState({ isMarkdownOutlineVisible: false, markdownThemePreference: "inherit" });
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    parseMock.mockReset();
    vi.useRealTimers();
  });

  it("stays hidden by default when outline visibility setting is off", async () => {
    layoutStore.setState({ isMarkdownOutlineVisible: false });

    render(<MarkdownPreview content="# placeholder" />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Intro" })).toBeNull();
    });

    expect(await screen.findByRole("button", { name: "Show outline" })).toBeTruthy();
  });

  it("renders an outline from nested headings", async () => {
    render(<MarkdownPreview content="# placeholder" />);

    expect(await screen.findByRole("button", { name: "Intro" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Setup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Usage" })).toBeTruthy();
  });

  it("scrolls the matching heading into view when an outline item is clicked", async () => {
    render(<MarkdownPreview content="# placeholder" />);

    fireEvent.click(await screen.findByRole("button", { name: "Usage" }));

    await waitFor(() => {
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });

  it("collapses and re-expands nested headings", async () => {
    render(<MarkdownPreview content="# placeholder" />);

    fireEvent.click(await screen.findByRole("button", { name: "Collapse Setup" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Expand Setup" }));

    expect(await screen.findByRole("button", { name: "Install" })).toBeTruthy();
  });

  it("hides and shows the outline panel", async () => {
    render(<MarkdownPreview content="# placeholder" />);

    expect(await screen.findByRole("button", { name: "Hide outline" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide outline" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Intro" })).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Show outline" }));

    expect(await screen.findByRole("button", { name: "Intro" })).toBeTruthy();
  });

  it("uses a non-transparent preview background when forced to the opposite theme", async () => {
    layoutStore.setState({ markdownThemePreference: "light" });

    render(
      <ThemeProvider theme={createAppTheme("dark")}>
        <MarkdownPreviewThemeProvider>
          <MarkdownPreview content="# placeholder" />
        </MarkdownPreviewThemeProvider>
      </ThemeProvider>,
    );

    await screen.findByRole("button", { name: "Intro" });

    expect(getComputedStyle(screen.getByTestId("markdown-preview-root")).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("debounces content updates unless immediateUpdateToken changes", async () => {
    vi.useFakeTimers();
    parseMock.mockImplementation(async (content) => `<h1>${content}</h1>`);

    const { rerender } = render(<MarkdownPreview content="# one" />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(parseMock).toHaveBeenCalledWith("# one");

    parseMock.mockClear();
    rerender(<MarkdownPreview content="# two" />);

    await act(async () => {
      vi.advanceTimersByTime(399);
    });
    expect(parseMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(parseMock).toHaveBeenCalledWith("# two");

    parseMock.mockClear();
    rerender(<MarkdownPreview content="# three" immediateUpdateToken={1} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(parseMock).toHaveBeenCalledWith("# three");
  });
});
