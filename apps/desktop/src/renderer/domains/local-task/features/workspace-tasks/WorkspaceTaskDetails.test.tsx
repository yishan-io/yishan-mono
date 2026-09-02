// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTaskDetails } from "./WorkspaceTaskDetails";

const translation = vi.hoisted(() => ({
  language: "de-DE",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: translation.language },
  }),
}));
vi.mock("../../commands/localTaskCommands", () => ({
  loadLocalTaskContext: vi.fn(),
}));
vi.mock("@renderer/domains/files", () => ({
  markdownService: { parse: vi.fn(async (content: string) => `<p>${content}</p>`) },
  FileTree: ({
    files,
    onSelectEntry,
  }: {
    files: string[];
    onSelectEntry?: (input: { path: string; isDirectory: boolean }) => void;
  }) => (
    <button
      type="button"
      data-testid="task-context-file-tree-content"
      onClick={() => onSelectEntry?.({ path: files[0] ?? "", isDirectory: false })}
    >
      {files.join(" ")}
    </button>
  ),
}));
vi.mock("@renderer/domains/project", () => ({
  renderProjectIcon: (iconId: string | undefined) => `project-icon-${iconId}`,
}));

const task = {
  id: "task-1",
  projectId: null,
  title: "Task title",
  description: "Task description",
  status: "progressing" as const,
  priority: "medium" as const,
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-02T12:00:00.000Z",
  completedAt: null,
  hasActiveWorkspace: false,
  tags: [],
  tagRefs: [],
};

function renderDetails(context?: {
  directory: string;
  files: { name: "plan.md" | "notes.md" | "outcome.md"; path: string }[];
}) {
  return render(
    <WorkspaceTaskDetails
      task={task}
      context={context}
      contextLoadState="loaded"
      contextError={null}
      isMutationLoading={false}
      onStatusChange={vi.fn()}
      onPriorityChange={vi.fn()}
      onTagIdsChange={vi.fn()}
      onCreateTag={vi.fn()}
    />,
  );
}

describe("WorkspaceTaskDetails", () => {
  afterEach(cleanup);

  it("renders detail projection errors and retries", () => {
    const onRetryDetails = vi.fn();
    render(
      <WorkspaceTaskDetails
        task={task}
        contextLoadState="loaded"
        contextError={null}
        detailsLoadState="error"
        detailsError="detail projection unavailable"
        onRetryDetails={onRetryDetails}
        isMutationLoading={false}
        onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()}
        onTagIdsChange={vi.fn()}
        onCreateTag={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("detail projection unavailable");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));
    expect(onRetryDetails).toHaveBeenCalledOnce();
  });

  it("formats timestamps with the active i18n locale", () => {
    renderDetails();

    const expectedTimestamp = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(task.updatedAt),
    );
    expect(screen.getByText(expectedTimestamp)).toBeTruthy();
  });

  it("renders the resolved project icon and name", () => {
    render(
      <WorkspaceTaskDetails
        task={{ ...task, projectId: "project-1" }}
        contextLoadState="loaded"
        contextError={null}
        details={{
          task,
          project: { id: "project-1", name: "Project One", icon: "rocket", color: "#3B82F6" },
          workspaces: [],
        }}
        isMutationLoading={false}
        onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()}
        onTagIdsChange={vi.fn()}
        onCreateTag={vi.fn()}
      />,
    );

    expect(screen.getByText("Project One")).toBeTruthy();
    expect(screen.getByTestId("local-task-project-icon").textContent).toBe("project-icon-rocket");
  });

  it("retains the project section with a neutral placeholder when a project cannot be resolved", () => {
    const { rerender } = render(
      <WorkspaceTaskDetails
        task={task}
        details={{ task, project: null, workspaces: [] }}
        contextLoadState="loaded"
        contextError={null}
        isMutationLoading={false}
        onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()}
        onTagIdsChange={vi.fn()}
        onCreateTag={vi.fn()}
      />,
    );
    expect(screen.getByText("localTask.states.globalTask")).toBeTruthy();

    rerender(
      <WorkspaceTaskDetails
        task={{ ...task, projectId: "project-unresolved" }}
        details={{ task: { ...task, projectId: "project-unresolved" }, project: null, workspaces: [] }}
        contextLoadState="loaded"
        contextError={null}
        isMutationLoading={false}
        onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()}
        onTagIdsChange={vi.fn()}
        onCreateTag={vi.fn()}
      />,
    );
    expect(screen.getByText("localTask.fields.project")).toBeTruthy();
    expect(screen.getAllByText("localTask.states.noValue")).toHaveLength(2);
    expect(screen.queryByText("project-unresolved")).toBeNull();
    expect(screen.queryByText("localTask.states.globalTask")).toBeNull();
  });

  it("renders resolved workspace displays with their kind icons", () => {
    render(
      <WorkspaceTaskDetails
        task={task}
        contextLoadState="loaded"
        contextError={null}
        details={{
          task,
          project: null,
          workspaces: [
            { id: "workspace-local", projectId: "project-1", name: "Local workspace", kind: "local", status: "active" },
            {
              id: "workspace-managed",
              projectId: "project-1",
              name: "Managed workspace",
              kind: "managed",
              status: "active",
            },
            {
              id: "workspace-folder",
              projectId: "project-1",
              name: "Folder workspace",
              kind: "folder",
              status: "closed",
            },
          ],
        }}
        isMutationLoading={false}
        onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()}
        onTagIdsChange={vi.fn()}
        onCreateTag={vi.fn()}
      />,
    );

    expect(screen.getByText("Local workspace")).toBeTruthy();
    expect(screen.getByText("Managed workspace")).toBeTruthy();
    expect(screen.getByText("Folder workspace")).toBeTruthy();
    expect(screen.getAllByTestId("local-task-workspace-icon")).toHaveLength(3);
    expect(screen.queryByText("workspace-unresolved-id")).toBeNull();
  });

  it("retains the workspace section with a neutral placeholder while workspace data is unavailable", () => {
    renderDetails();

    expect(screen.getByText("localTask.fields.workspace")).toBeTruthy();
    expect(screen.getAllByText("localTask.states.noValue")).toHaveLength(2);
  });

  it("renders a stable fallback for malformed updated timestamps", () => {
    render(
      <WorkspaceTaskDetails
        task={{ ...task, updatedAt: "malformed" }}
        contextLoadState="loaded"
        contextError={null}
        isMutationLoading={false}
        onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()}
        onTagIdsChange={vi.fn()}
        onCreateTag={vi.fn()}
      />,
    );

    expect(screen.getByText("localTask.states.unknownDate")).toBeTruthy();
    expect(screen.getByText(task.description)).toBeTruthy();
  });

  it("renders context file names from POSIX and Windows paths", () => {
    renderDetails({
      directory: "C:\\contexts\\task-1",
      files: [
        { name: "plan.md", path: "C:\\contexts\\task-1\\plan.md" },
        { name: "notes.md", path: "/contexts/task-1/notes.md" },
        { name: "outcome.md", path: "C:\\contexts\\task-1/outcome.md" },
      ],
    });

    const contextFileTree = screen.getByTestId("task-context-file-tree-content");
    expect(contextFileTree.textContent).toContain("plan.md");
    expect(contextFileTree.textContent).toContain("notes.md");
    expect(contextFileTree.textContent).toContain("outcome.md");
  });

  it("shows an empty-state placeholder for an empty Task Context directory", () => {
    renderDetails({ directory: "/contexts/task-1", files: [] });

    const contextTitle = screen.getByText("localTask.context.files");
    expect(contextTitle.parentElement?.textContent).toContain("localTask.states.noValue");
    expect(screen.queryByTestId("task-context-file-tree")).toBeNull();
  });

  it("renders only daemon-confirmed context files and opens them on click", () => {
    const onContextFileOpen = vi.fn();
    render(
      <WorkspaceTaskDetails
        task={task}
        context={{ directory: "/contexts/task-1", files: [{ name: "notes.md", path: "/contexts/task-1/notes.md" }] }}
        contextLoadState="loaded"
        contextError={null}
        isMutationLoading={false}
        onStatusChange={vi.fn()}
        onPriorityChange={vi.fn()}
        onTagIdsChange={vi.fn()}
        onCreateTag={vi.fn()}
        onContextFileOpen={onContextFileOpen}
      />,
    );

    expect(screen.getByTestId("task-context-file-tree")).toBeTruthy();
    fireEvent.click(screen.getByTestId("task-context-file-tree-content"));
    expect(onContextFileOpen).toHaveBeenCalledWith("notes.md");
    expect(screen.queryByText("plan.md")).toBeNull();
    expect(screen.queryByText("outcome.md")).toBeNull();
  });

  it("centers the entire detail surface at 1200px without overflowing the pane", () => {
    renderDetails();

    const detailSurface = screen.getByTestId("local-task-detail-layout").parentElement;
    if (!detailSurface) {
      throw new Error("Expected Local Task detail surface");
    }

    const styles = getComputedStyle(detailSurface);
    expect(styles.width).toBe("1200px");
    expect(styles.maxWidth).toBe("100%");
    expect(styles.marginLeft).toBe("auto");
    expect(styles.marginRight).toBe("auto");
  });

  it("keeps the metadata sidebar sticky while the detail content scrolls", () => {
    renderDetails();

    const sidebar = screen.getByTestId("local-task-details-sidebar");
    expect(getComputedStyle(sidebar).position).toBe("sticky");
    expect(getComputedStyle(sidebar).top).toBe("0px");
  });

  it("keeps the default side-by-side layout on wide containers and stacks at narrow widths", () => {
    renderDetails();

    const layout = screen.getByTestId("local-task-detail-layout");
    const layoutStyles = Array.from(document.styleSheets)
      .flatMap((styleSheet) => Array.from(styleSheet.cssRules))
      .map((rule) => rule.cssText)
      .join(" ");

    expect(getComputedStyle(layout).gridTemplateColumns).toBe("minmax(0, 1fr) 350px");
    expect(layoutStyles).toContain("@container (max-width: 400px)");
    expect(layoutStyles).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
