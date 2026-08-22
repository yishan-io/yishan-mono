// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as daemon from "../../daemon/localTaskDaemonClient";
import type { LocalTask, LocalTaskWorkspaceLink } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";
import { WorkspaceTasksView } from "./WorkspaceTasksView";

vi.mock("../../daemon/localTaskDaemonClient", () => ({
  createLocalTask: vi.fn(),
  getLocalTask: vi.fn(),
  listLocalTasks: vi.fn(),
  searchLocalTasks: vi.fn(),
  updateLocalTask: vi.fn(),
  getLocalTaskContext: vi.fn(),
  linkLocalTaskWorkspace: vi.fn(),
  unlinkLocalTaskWorkspace: vi.fn(),
  setPrimaryLocalTask: vi.fn(),
  updateLocalTaskLinkStatus: vi.fn(),
  listLocalTaskWorkspaceLinks: vi.fn(),
  listLocalTaskLinks: vi.fn(),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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
  createdAt: "created",
  updatedAt: "updated",
  completedAt: "completed",
};
const historicalLink: LocalTaskWorkspaceLink = {
  id: "historical-link",
  localTaskId: historicalTask.id,
  workspaceId: "workspace-1",
  role: "related",
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
    vi.mocked(daemon.getLocalTask).mockReturnValue(delayed.promise);
    vi.mocked(daemon.getLocalTaskContext).mockResolvedValue({
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
    expect(daemon.getLocalTask).toHaveBeenCalledTimes(1);

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
    expect(daemon.getLocalTask).toHaveBeenCalledTimes(1);
    expect(daemon.getLocalTask).toHaveBeenCalledWith(historicalTask.id);

    delayed.resolve(historicalTask);
    await waitFor(() => expect(localTaskStore.getState().taskById[historicalTask.id]).toEqual(historicalTask));
    expect(daemon.getLocalTask).toHaveBeenCalledTimes(1);
  });
  it("shows a historical detail failure and retries the same task", async () => {
    vi.mocked(daemon.getLocalTask)
      .mockRejectedValueOnce(new Error("transient detail failure"))
      .mockResolvedValueOnce(historicalTask);
    vi.mocked(daemon.getLocalTaskContext).mockResolvedValue({
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

    expect((await screen.findByRole("alert")).textContent).toContain("transient detail failure");
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.retry" }));

    await waitFor(() => expect(screen.getAllByText("Delayed historical task").length).toBeGreaterThan(1));
    expect(daemon.getLocalTask).toHaveBeenCalledTimes(2);
    expect(daemon.getLocalTask).toHaveBeenLastCalledWith(historicalTask.id);
  });
});
