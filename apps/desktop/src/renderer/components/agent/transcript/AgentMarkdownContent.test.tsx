// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentMarkdownContent } from "./AgentMarkdownContent";

const mocked = vi.hoisted(() => ({
  openTab: vi.fn(),
  openTabInOppositePane: vi.fn(),
  parse: vi.fn<(content: string) => Promise<string>>(),
}));

vi.mock("@renderer/components/markdown/markdownService", () => ({
  markdownService: {
    parse: mocked.parse,
  },
}));

vi.mock("../../../commands/tabCommands", () => ({
  openTab: mocked.openTab,
  openTabInOppositePane: mocked.openTabInOppositePane,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentMarkdownContent", () => {
  it("renders streaming text without invoking the markdown parser", async () => {
    render(<AgentMarkdownContent content="**streaming**" renderMode="streaming" />);

    expect(screen.getByText("**streaming**")).toBeTruthy();

    await waitFor(() => {
      expect(mocked.parse).not.toHaveBeenCalled();
    });
  });

  it("keeps file-link underlines hidden until hover", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>src/example.ts</code></p>");

    const { container } = render(<AgentMarkdownContent content="`src/example.ts`" workspacePath="/project" />);

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector<HTMLElement>(".file-link");
    expect(fileLink?.style.textDecoration).toBe("");
    expect(fileLink?.style.cursor).toBe("pointer");
  });

  it("strips line ranges before opening a file link", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>.github/pull_request_template.md:32-37</code></p>");

    const { container } = render(
      <AgentMarkdownContent content="`.github/pull_request_template.md:32-37`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    expect(fileLink.textContent).toBe(".github/pull_request_template.md");
    expect(container.querySelector(".file-line-range")?.textContent).toBe(":32-37");
    expect(container.textContent).toContain(".github/pull_request_template.md:32-37");

    fireEvent.click(fileLink);

    expect(mocked.openTab).toHaveBeenCalledWith({ kind: "file", path: "/project/.github/pull_request_template.md" });
  });

  it("still parses finalized markdown content", async () => {
    mocked.parse.mockResolvedValueOnce("<p><strong>done</strong></p>");

    render(<AgentMarkdownContent content="**done**" renderMode="final" />);

    await waitFor(() => {
      expect(mocked.parse).toHaveBeenCalledWith("**done**");
    });
  });
});
