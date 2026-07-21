// @vitest-environment jsdom

import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { postProcessMarkdownPreview } from "./markdownPreviewDom";

const openTabMock = vi.fn();
const buildWorkspaceFileUrlMock = vi.fn();
const openLinkMock = vi.fn();
const enqueueWorkspaceErrorNoticeMock = vi.fn();

vi.mock("@renderer/commands/appCommands", () => ({
  openLink: (options: { url: string }) => openLinkMock(options),
}));

vi.mock("@renderer/commands/fileCommands", () => ({
  buildWorkspaceFileUrl: (options: { workspaceWorktreePath: string; relativePath: string }) =>
    buildWorkspaceFileUrlMock(options),
}));

vi.mock("@renderer/store/tabStore", () => ({
  tabStore: {
    getState: () => ({
      openTab: openTabMock,
    }),
  },
}));

vi.mock("@renderer/store/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: (notice: { title: string; message: string }) => enqueueWorkspaceErrorNoticeMock(notice),
}));

describe("postProcessMarkdownPreview", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    buildWorkspaceFileUrlMock.mockReset();
    openTabMock.mockReset();
    openLinkMock.mockReset();
    enqueueWorkspaceErrorNoticeMock.mockReset();
    buildWorkspaceFileUrlMock.mockImplementation(
      ({ workspaceWorktreePath, relativePath }) => `workspace://${workspaceWorktreePath}/${relativePath}`,
    );
    openLinkMock.mockResolvedValue({ opened: true });
  });

  it("extracts mermaid placeholders and keeps link and task-list handlers working after image rewrite", () => {
    const container = document.createElement("div");
    const onContentChange = vi.fn();

    const result = postProcessMarkdownPreview({
      container,
      html: `
        <h1>Title</h1>
        <pre><code class="language-mermaid">graph TD\nA-->B\n</code></pre>
        <img src="./diagram.png" alt="Diagram" />
        <a href="./guide.md">Guide</a>
        <ul><li><input type="checkbox" checked /> Task</li></ul>
      `,
      worktreePath: "/workspace",
      fileDir: "docs/reference",
      canEdit: true,
      content: "- [x] Task",
      onContentChange,
    });

    expect(result.mermaidBlocks).toEqual([{ id: "mermaid-placeholder-0", code: "graph TD\nA-->B" }]);
    expect(container.querySelector("[data-mermaid-id='mermaid-placeholder-0']")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "workspace:///workspace/docs/reference/diagram.png",
    );
    expect(result.outlineData).not.toBeNull();
    expect(result.outlineData?.entries.map((entry) => entry.title)).toEqual(["Title"]);

    const link = container.querySelector("a") as HTMLAnchorElement;
    const linkClickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(linkClickEvent);
    expect(openTabMock).toHaveBeenCalledWith({ kind: "file", path: "docs/reference/guide.md" });

    fireEvent.click(container.querySelector("input") as HTMLInputElement);
    expect(onContentChange).toHaveBeenCalledWith("- [ ] Task");
  });

  it("preserves the original early-return behavior when image processing hits an absolute URL", () => {
    const container = document.createElement("div");
    const onContentChange = vi.fn();

    const result = postProcessMarkdownPreview({
      container,
      html: `
        <h1>Title</h1>
        <pre class="mermaid">graph TD\nA-->B\n</pre>
        <img src="https://example.com/hero.png" alt="Remote" />
        <img src="./diagram.png" alt="Local" />
        <a href="./guide.md">Guide</a>
        <ul><li><input type="checkbox" checked /> Task</li></ul>
      `,
      worktreePath: "/workspace",
      fileDir: "docs/reference",
      canEdit: true,
      content: "- [x] Task",
      onContentChange,
    });

    expect(container.querySelector("[data-mermaid-id='mermaid-placeholder-0']")).toBeTruthy();
    expect(container.querySelectorAll("img")[1]?.getAttribute("src")).toBe("./diagram.png");

    fireEvent.click(container.querySelector("a") as HTMLAnchorElement);
    fireEvent.click(container.querySelector("input") as HTMLInputElement);

    expect(openTabMock).not.toHaveBeenCalled();
    expect(onContentChange).not.toHaveBeenCalled();
  });
});
