// @vitest-environment jsdom

import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentMarkdownContent } from "./AgentMarkdownContent";

const mocked = vi.hoisted(() => ({
  openTab: vi.fn(),
  openTabInOppositePane: vi.fn(),
  openChatFileTab: vi.fn(),
  selectFolderInFileTree: vi.fn(),
  parse: vi.fn<(content: string) => Promise<string>>(),
  workspaceState: { workspaces: [] as Array<{ id: string; worktreePath?: string | null }>, selectedWorkspaceId: "" },
}));

vi.mock("@renderer/domains/files/ui/markdown/markdownService", () => ({
  markdownService: {
    parse: mocked.parse,
  },
}));

vi.mock("../../../../../domains/workbench/commands/tabCommands", () => ({
  openTab: mocked.openTab,
  openTabInOppositePane: mocked.openTabInOppositePane,
}));

vi.mock("../../../../../domains/agent/commands/agentChatCommands", () => ({
  openChatFileTab: mocked.openChatFileTab,
}));

vi.mock("../../../../../domains/workspace/state/workspaceStore", () => {
  const selectorMock = (selector: (state: typeof mocked.workspaceState) => unknown) => selector(mocked.workspaceState);
  return {
    workspaceStore: Object.assign(selectorMock, {
      getState: () => mocked.workspaceState,
    }),
  };
});

vi.mock("../../../../../domains/workspace/commands/workspaceCommands", () => ({
  selectFolderInFileTree: mocked.selectFolderInFileTree,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocked.workspaceState.workspaces = [];
  mocked.workspaceState.selectedWorkspaceId = "";
});

describe("AgentMarkdownContent", () => {
  it("renders streaming text without invoking the markdown parser", async () => {
    renderWithAppTheme(<AgentMarkdownContent content="**streaming**" renderMode="streaming" />);

    expect(screen.getByText("**streaming**")).toBeTruthy();

    await waitFor(() => {
      expect(mocked.parse).not.toHaveBeenCalled();
    });
  });

  it("keeps file-link underlines hidden until hover", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>src/example.ts</code></p>");

    const { container } = renderWithAppTheme(
      <AgentMarkdownContent content="`src/example.ts`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector<HTMLElement>(".file-link");
    expect(fileLink?.style.textDecoration).toBe("");
    expect(fileLink?.style.cursor).toBe("pointer");
  });

  it("strips line ranges before opening a file link", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>.github/pull_request_template.md:32-37</code></p>");

    const { container } = renderWithAppTheme(
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

    expect(mocked.openTab).toHaveBeenCalledWith({ kind: "file", path: ".github/pull_request_template.md" });
  });

  it("still parses finalized markdown content", async () => {
    mocked.parse.mockResolvedValueOnce("<p><strong>done</strong></p>");

    renderWithAppTheme(<AgentMarkdownContent content="**done**" renderMode="final" />);

    await waitFor(() => {
      expect(mocked.parse).toHaveBeenCalledWith("**done**");
    });
  });

  it("selects a folder path ending with / in the file tree instead of opening a file tab", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>apps/desktop/src/</code></p>");

    const { container } = renderWithAppTheme(
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

    const { container } = renderWithAppTheme(
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

    const { container } = renderWithAppTheme(
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

    const { container } = renderWithAppTheme(
      <AgentMarkdownContent content="`apps/desktop/src/index.ts`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).toHaveBeenCalledWith({ kind: "file", path: "apps/desktop/src/index.ts" });
    expect(mocked.selectFolderInFileTree).not.toHaveBeenCalled();
  });

  it("resolves chat file opens through the workspace before opening the tab", async () => {
    mocked.workspaceState.workspaces = [{ id: "workspace-1", worktreePath: "/project" }];
    mocked.workspaceState.selectedWorkspaceId = "workspace-1";
    mocked.parse.mockResolvedValueOnce("<p><code>apps/desktop/src/index.ts</code></p>");

    const { container } = renderWithAppTheme(
      <AgentMarkdownContent content="`apps/desktop/src/index.ts`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).not.toHaveBeenCalled();
    expect(mocked.openChatFileTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "apps/desktop/src/index.ts",
    });
  });

  it("resolves cmd+click chat file opens into the opposite pane", async () => {
    mocked.workspaceState.workspaces = [{ id: "workspace-1", worktreePath: "/project" }];
    mocked.workspaceState.selectedWorkspaceId = "workspace-1";
    mocked.parse.mockResolvedValueOnce("<p><code>apps/desktop/src/index.ts</code></p>");

    const { container } = renderWithAppTheme(
      <AgentMarkdownContent content="`apps/desktop/src/index.ts`" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink, { metaKey: true });

    expect(mocked.openChatFileTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "apps/desktop/src/index.ts",
      oppositePane: true,
    });
  });

  it("maps subdirectory-cwd transcripts to the workspace root and re-relativizes paths", async () => {
    mocked.workspaceState.workspaces = [{ id: "workspace-1", worktreePath: "/project" }];
    mocked.workspaceState.selectedWorkspaceId = "workspace-1";
    mocked.parse.mockResolvedValueOnce("<p><code>db/index.ts</code></p>");

    const { container } = renderWithAppTheme(
      <AgentMarkdownContent content="`db/index.ts`" workspacePath="/project/src" />,
    );

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    // Path was resolved against the subdir cwd, then re-based on the workspace root.
    expect(mocked.openChatFileTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "src/db/index.ts",
    });
  });

  it("falls back to a plain open when no workspace owns the transcript cwd", async () => {
    mocked.workspaceState.workspaces = [{ id: "workspace-1", worktreePath: "/project" }];
    mocked.parse.mockResolvedValueOnce("<p><code>src/a.ts</code></p>");

    const { container } = renderWithAppTheme(<AgentMarkdownContent content="`src/a.ts`" workspacePath="/elsewhere" />);

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).toHaveBeenCalledWith({ kind: "file", path: "src/a.ts" });
    expect(mocked.openChatFileTab).not.toHaveBeenCalled();
  });

  it("does not treat URLs as folders", async () => {
    mocked.parse.mockResolvedValueOnce("<p><a href='https://example.com/dir/'>link</a></p>");

    const { container } = renderWithAppTheme(
      <AgentMarkdownContent content="[link](https://example.com/dir/)" workspacePath="/project" />,
    );

    await waitFor(() => {
      expect(container.querySelector("a")).not.toBeNull();
    });

    const anchor = container.querySelector("a") as HTMLElement;
    fireEvent.click(anchor);

    expect(mocked.selectFolderInFileTree).not.toHaveBeenCalled();
  });

  it("treats extensionless dotfiles like .eslintrc as files, not folders", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>.eslintrc</code></p>");

    const { container } = renderWithAppTheme(<AgentMarkdownContent content="`.eslintrc`" workspacePath="/project" />);

    await waitFor(() => {
      expect(container.querySelector(".file-link")).not.toBeNull();
    });

    const fileLink = container.querySelector(".file-link") as HTMLElement;
    fireEvent.click(fileLink);

    expect(mocked.openTab).toHaveBeenCalledWith({ kind: "file", path: ".eslintrc" });
    expect(mocked.selectFolderInFileTree).not.toHaveBeenCalled();
  });

  it("resolves ../ in folder paths before selecting in tree", async () => {
    mocked.parse.mockResolvedValueOnce("<p><code>../sibling-dir/</code></p>");

    const { container } = renderWithAppTheme(
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
