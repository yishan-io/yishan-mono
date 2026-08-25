// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";
import { WorkspaceTasksView } from "./WorkspaceTasksView";

vi.mock("../../daemon/localTaskDaemonClient", () => ({
  localTaskClient: {
    create: vi.fn(),
    get: vi.fn(),
    getDetails: vi.fn(),
    list: vi.fn(),
    listTags: vi.fn(async () => []),
    search: vi.fn(),
    listTagCatalog: vi.fn(),
    updateTagColor: vi.fn(),
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    update: vi.fn(),
    getContext: vi.fn(),
    linkWorkspace: vi.fn(),
    unlinkWorkspace: vi.fn(),
    updateLinkStatus: vi.fn(),
    listWorkspaceLinks: vi.fn(),
    listTaskLinks: vi.fn(),
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en-US" } }),
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 128,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 128 })),
  }),
}));

const initialState = localTaskStore.getState();
const historicalTask: LocalTask = {
  id: "historical-task",
  projectId: null,
  title: "Delayed historical task",
  description: "",
  status: "completed",
  priority: "medium",
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-02T12:00:00.000Z",
  completedAt: "2026-01-03T12:00:00.000Z",
  tags: [],
  tagRefs: [],
};
const historicalLink: LocalTaskWorkspaceLink = {
  id: "historical-link",
  localTaskId: historicalTask.id,
  workspaceId: "workspace-1",
  status: "completed",
  linkedAt: "linked",
  unlinkedAt: "unlinked",
};

function deferredTask() {
  let resolve!: (task: LocalTask) => void;
  const promise = new Promise<LocalTask>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  localTaskStore.setState(initialState, true);
  vi.clearAllMocks();
});

describe("WorkspaceTasksView detail loading", () => {
  it("issues at most one delayed detail request per task while mounted visibility and store state change", async () => {
    const delayed = deferredTask();
    vi.mocked(daemon.localTaskClient.get).mockReturnValue(delayed.promise);
    vi.mocked(daemon.localTaskClient.getDetails).mockResolvedValue({
      task: historicalTask,
      project: null,
      workspaces: [],
    });
    vi.mocked(daemon.localTaskClient.getContext).mockResolvedValue({
      directory: "/context/historical-task",
      planPath: "/context/historical-task/plan.md",
      notesPath: "/context/historical-task/notes.md",
      outcomePath: "/context/historical-task/outcome.md",
    });
    localTaskStore.setState({
      workspaceLoadState: "loaded",
      workspaceLinks: [historicalLink],
      selectedWorkspaceTaskId: historicalTask.id,
      taskById: {},
    });

    const view = render(
      <section hidden={false}>
        <WorkspaceTasksView workspaceId="workspace-1" />
      </section>,
    );
    expect(daemon.localTaskClient.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /historical-task/ }));
    expect(daemon.localTaskClient.get).toHaveBeenCalledTimes(1);

    localTaskStore.getState().upsertTaskEntity({ ...historicalTask, id: "unrelated-task" });
    view.rerender(
      <section hidden>
        <WorkspaceTasksView workspaceId="workspace-1" />
      </section>,
    );
    view.rerender(
      <section hidden={false}>
        <WorkspaceTasksView workspaceId="workspace-1" />
      </section>,
    );
    expect(daemon.localTaskClient.get).toHaveBeenCalledTimes(1);
    expect(daemon.localTaskClient.get).toHaveBeenCalledWith(historicalTask.id);

    delayed.resolve(historicalTask);
    await waitFor(() => expect(localTaskStore.getState().taskById[historicalTask.id]).toEqual(historicalTask));
    expect(daemon.localTaskClient.get).toHaveBeenCalledTimes(1);
  });
  it("shows a historical detail failure and retries the same task", async () => {
    vi.mocked(daemon.localTaskClient.get)
      .mockRejectedValueOnce(new Error("transient detail failure"))
      .mockResolvedValueOnce(historicalTask);
    vi.mocked(daemon.localTaskClient.getDetails).mockResolvedValue({
      task: historicalTask,
      project: null,
      workspaces: [],
    });
    vi.mocked(daemon.localTaskClient.getContext).mockResolvedValue({
      directory: "/context/historical-task",
      planPath: "/context/historical-task/plan.md",
      notesPath: "/context/historical-task/notes.md",
      outcomePath: "/context/historical-task/outcome.md",
    });
    localTaskStore.setState({
      workspaceLoadState: "loaded",
      workspaceLinks: [historicalLink],
      selectedWorkspaceTaskId: historicalTask.id,
      taskById: {},
    });

    render(<WorkspaceTasksView workspaceId="workspace-1" />);
    fireEvent.click(screen.getByRole("button", { name: /historical-task/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("transient detail failure");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));

    await waitFor(() => expect(screen.getAllByText("Delayed historical task").length).toBe(1));
    expect(daemon.localTaskClient.get).toHaveBeenCalledTimes(2);
    expect(daemon.localTaskClient.get).toHaveBeenLastCalledWith(historicalTask.id);
  });
});
