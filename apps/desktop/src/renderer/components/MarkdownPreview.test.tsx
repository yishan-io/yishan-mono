// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

const parseMock = vi.fn<(content: string) => Promise<string>>();

vi.mock("./markdownService", () => ({
  markdownService: {
    parse: (content: string) => parseMock(content),
  },
}));

describe("MarkdownPreview outline", () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
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
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    parseMock.mockReset();
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
});
