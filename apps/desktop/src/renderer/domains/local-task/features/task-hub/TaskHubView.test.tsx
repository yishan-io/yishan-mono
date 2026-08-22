// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTaskStore } from "../../state/localTaskStore";
import { TaskHubView } from "./TaskHubView";

const commands = vi.hoisted(() => ({
  createLocalTask: vi.fn(async () => undefined),
  createAndLinkLocalTask: vi.fn(async () => undefined),
  refreshLocalTaskHub: vi.fn(async () => undefined),
  setLocalTaskHubFilters: vi.fn(async () => undefined),
  setLocalTaskHubSearchQuery: vi.fn(async () => undefined),
}));

vi.mock("../../commands/localTaskCommands", () => commands);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@renderer/domains/project", () => ({
  projectStore: (selector: (state: { projects: Array<{ id: string; name: string }> }) => unknown) =>
    selector({ projects: [{ id: "project-1", name: "Project One" }] }),
}));
vi.mock("@renderer/domains/workspace", () => ({
  workspaceStore: (selector: (state: { workspaces: Array<{ id: string; name: string; title: string }> }) => unknown) =>
    selector({ workspaces: [{ id: "workspace-1", name: "Workspace One", title: "Workspace One" }] }),
}));
vi.mock("@renderer/domains/workbench", () => ({
  PaneHeader: ({ children }: { children: React.ReactNode }) => children,
  PaneToggleButton: () => null,
  useWorkspacePaneVisibilityContext: () => ({ leftCollapsed: false, onToggleLeftPane: vi.fn() }),
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 8) }, (_, index) => ({ index, key: index, start: index * 88, size: 88 })),
  }),
}));

const task = {
  id: "task-1",
  projectId: "project-1",
  title: "Ship Task Hub",
  description: "Desktop UX",
  status: "active" as const,
  priority: "high" as const,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  completedAt: null,
};

const initialState = localTaskStore.getState();

describe("TaskHubView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localTaskStore.setState({ ...initialState, hubTasks: [task], hubLoadState: "loaded", hubError: null });
  });

  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
  });

  it("searches, filters, and creates through Local Task commands", async () => {
    render(<TaskHubView />);
    fireEvent.change(screen.getByRole("textbox", { name: "localTask.search.label" }), { target: { value: "ship" } });
    expect(commands.setLocalTaskHubSearchQuery).toHaveBeenCalledWith("ship");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.status" }));
    fireEvent.click(await screen.findByRole("option", { name: "localTask.status.paused" }));
    expect(commands.setLocalTaskHubFilters).toHaveBeenCalledWith({ status: "paused" });

    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    fireEvent.change(screen.getByRole("textbox", { name: "localTask.fields.title" }), {
      target: { value: "New task" },
    });
    const createButtons = screen.getAllByRole("button", { name: "localTask.actions.create" });
    const submitButton = createButtons.at(-1);
    expect(submitButton).toBeTruthy();
    if (submitButton) fireEvent.click(submitButton);
    expect(commands.createLocalTask).toHaveBeenCalledWith({
      projectId: undefined,
      title: "New task",
      description: "",
      priority: "medium",
    });
  });

  it.each([
    ["loading", "progressbar", "localTask.states.loading"],
    ["loaded", "text", "localTask.states.empty"],
    ["error", "alert", "daemon unavailable"],
  ] as const)("renders the %s state", (hubLoadState, role, expectedText) => {
    localTaskStore.setState({ hubLoadState, hubTasks: [], hubError: hubLoadState === "error" ? expectedText : null });
    render(<TaskHubView />);
    if (role === "progressbar") expect(screen.getByRole("progressbar", { name: expectedText })).toBeTruthy();
    else if (role === "alert") expect(screen.getByRole("alert").textContent).toContain(expectedText);
    else expect(screen.getByText(expectedText)).toBeTruthy();
  });

  it("submits with Enter and shows a dialog-local create error", async () => {
    commands.createLocalTask.mockRejectedValueOnce(new Error("create failed"));
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    const titleInput = screen.getByRole("textbox", { name: "localTask.fields.title" });
    fireEvent.change(titleInput, { target: { value: "Broken task" } });
    const form = titleInput.closest("form");
    expect(form).toBeTruthy();
    if (!form) return;
    fireEvent.submit(form);
    expect((await screen.findByRole("alert")).textContent).toContain("create failed");
  });

  it("disables create dialog actions while the mutation is loading", () => {
    render(<TaskHubView />);
    fireEvent.click(screen.getByRole("button", { name: "localTask.actions.create" }));
    act(() => localTaskStore.setState({ isMutationLoading: true }));
    expect((screen.getByRole("textbox", { name: "localTask.fields.title" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "common.actions.cancel" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("virtualizes task lists larger than fifty rows and translates enum labels", () => {
    const tasks = Array.from({ length: 60 }, (_, index) => ({ ...task, id: `task-${index}`, title: `Task ${index}` }));
    localTaskStore.setState({ hubTasks: tasks });
    render(<TaskHubView />);
    expect(screen.getByText("Task 0")).toBeTruthy();
    expect(screen.queryByText("Task 59")).toBeNull();
    expect(screen.getAllByText("localTask.status.active").length).toBeLessThan(60);
    expect(screen.getAllByText("localTask.status.active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("localTask.priority.high").length).toBeGreaterThan(0);
  });
});
