// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentMarkdownContent } from "./AgentMarkdownContent";

const mocked = vi.hoisted(() => ({
  openTab: vi.fn(),
  openTabInOppositePane: vi.fn(),
  selectFolderInFileTree: vi.fn(),
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

vi.mock("../../../commands/workspaceCommands", () => ({
  selectFolderInFileTree: mocked.selectFolderInFileTree,
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

  it("selects a folder path ending with / in the file tree instead of opening a file tab", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>apps/desktop/src/</code></p>");

    const { container } = render(
      <AgentMarkdownContent content="`apps/desktop/src/`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).not.toHaveBeenCalled();
    expect(mocked.selectFolderInFileTree).toHaveBeenCalledWith("apps/desktop/src");
  });

  it("selects a path without extension as a folder in the file tree", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>apps/desktop/src</code></p>");

    const { container } = render(
      <AgentMarkdownContent content="`apps/desktop/src`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).not.toHaveBeenCalled();
    expect(mocked.selectFolderInFileTree).toHaveBeenCalledWith("apps/desktop/src");
  });

  it("selects .my-context/ path as a folder in the file tree", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>.my-context/tasks/</code></p>");

    const { container } = render(
      <AgentMarkdownContent content="`.my-context/tasks/`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).not.toHaveBeenCalled();
    expect(mocked.selectFolderInFileTree).toHaveBeenCalledWith(".my-context/tasks");
  });

  it("keeps opening file tabs for paths with known extensions", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>apps/desktop/src/index.ts</code></p>");

    const { container } = render(
      <AgentMarkdownContent content="`apps/desktop/src/index.ts`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).toHaveBeenCalledWith({ kind: "file", path: "/project/apps/desktop/src/index.ts" });
    expect(mocked.selectFolderInFileTree).not.toHaveBeenCalled();
  });

  it("does not treat URLs as folders", async () => {
    mocked.parse.mockResolvedValueOnce("<p><a href='https://example.com/dir/'>link</a></p>");

    const { container } = render(
      <AgentMarkdownContent content="[link](https://example.com/dir/)" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector("a")).not.toBeNull();
    });

    const anchor = container.querySelector("a") as HTMLElement;
    fireEvent.click(anchor);

    expect(mocked.selectFolderInFileTree).not.toHaveBeenCalled();
  });

  it("resolves ../ in folder paths before selecting in tree", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>../sibling-dir/</code></p>");

    const { container } = render(
      <AgentMarkdownContent content="`../sibling-dir/`" workspacePath="/project/apps/desktop" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    // When the resolved path starts with workspacePath, the prefix is stripped.
    // For ../ paths that go above workspacePath, the full resolved absolute path is passed.
    expect(mocked.selectFolderInFileTree).toHaveBeenCalledWith("/project/apps/sibling-dir");
  });
});
