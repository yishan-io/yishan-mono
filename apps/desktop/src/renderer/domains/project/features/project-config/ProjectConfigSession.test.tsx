// @vitest-environment jsdom

import { workspaceStore } from "@renderer/domains/workspace";
import { initI18n } from "@renderer/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../state/projectStore";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";
import { useProjectConfigActions } from "./useProjectConfigActions";
import { useProjectConfigFormState } from "./useProjectConfigFormState";

const mocked = vi.hoisted(() => ({
  updateProjectConfig: vi.fn(),
  openLocalFolderDialog: vi.fn(),
}));

// Isolate command and host I/O; render the real form, hooks and sections.
vi.mock("../../commands/projectCommands", () => ({
  updateProjectConfig: mocked.updateProjectConfig,
  ensureProjectTaskPrefix: vi.fn(),
  copyProjectTaskPrefix: vi.fn(),
}));
vi.mock("../../host/folderPicker", () => ({ openLocalFolderDialog: mocked.openLocalFolderDialog }));
vi.mock("../../daemon/projectDaemonClient", () => ({
  getDefaultWorktreeLocation: vi.fn(async () => "/tmp/worktrees"),
}));

const initialProjects = projectStore.getState();
const initialWorkspaces = workspaceStore.getState();

function setProject(localPath: string | undefined = "/tmp/current", path = "/tmp/fallback") {
  projectStore.setState({
    projects: [{ id: "project-1", name: "Core", localPath, path, worktreePath: "/tmp/worktrees", missing: false }],
  });
}

function renderDialog() {
  const onClose = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ProjectConfigDialogView open repoId="project-1" onClose={onClose} />
    </QueryClientProvider>,
  );
  return { ...view, onClose, queryClient };
}

beforeAll(async () => {
  await initI18n();
});

beforeEach(() => {
  vi.resetAllMocks();
  workspaceStore.setState({ workspaces: [] });
  setProject();
  mocked.updateProjectConfig.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  projectStore.setState(initialProjects, true);
  workspaceStore.setState(initialWorkspaces, true);
});

describe("Project config sessions", () => {
  it("keeps a pending save attached across draft and store refreshes and shows its rejection", async () => {
    let rejectSave: (reason: Error) => void = () => {};
    mocked.updateProjectConfig.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onClose } = renderDialog();
    const localPath = await screen.findByRole("textbox", { name: "Local path" });
    await waitFor(() => expect(localPath.getAttribute("value")).toBe("/tmp/current"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(localPath.hasAttribute("disabled")).toBe(true));
    act(() => setProject("/tmp/refreshed"));
    await waitFor(() => expect(localPath.hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled")).toBe(true);
    rejectSave(new Error("Refresh save rejected"));
    expect((await screen.findByRole("alert")).textContent).toContain("Refresh save rejected");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps observing an active mutation when the draft changes", async () => {
    let rejectSave: (reason: Error) => void = () => {};
    mocked.updateProjectConfig.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(
      () => {
        const form = useProjectConfigFormState({
          open: true,
          repoId: "project-1",
          projects: projectStore.getState().projects,
          getDefaultWorktreeLocation: async () => "/tmp/worktrees",
        });
        const actions = useProjectConfigActions({
          open: true,
          ...form,
          onClose: () => {},
        });
        return { ...form, ...actions };
      },
      { wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> },
    );
    act(() => result.current.handleSave());
    await waitFor(() => expect(result.current.isSaving).toBe(true));
    act(() => result.current.setDraft((draft) => ({ ...draft, localPath: "/refreshed" })));
    expect(result.current.isSaving).toBe(true);
    await act(async () => rejectSave(new Error("Draft refresh rejected")));
    await waitFor(() => expect(result.current.saveError).toBe("Draft refresh rejected"));
  });

  it("retains a save failure when a late worktree default updates the draft", async () => {
    let resolveDefault: (path: string) => void = () => {};
    const getDefaultWorktreeLocation = () =>
      new Promise<string>((resolve) => {
        resolveDefault = resolve;
      });
    const projects = [{ id: "project-1", name: "Core", localPath: "/tmp/current", worktreePath: "" }];
    mocked.updateProjectConfig.mockRejectedValueOnce(new Error("Save rejected before default"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(
      () => {
        const form = useProjectConfigFormState({
          open: true,
          repoId: "project-1",
          projects,
          getDefaultWorktreeLocation,
        });
        const actions = useProjectConfigActions({ open: true, ...form, onClose: () => {} });
        return { ...form, ...actions };
      },
      { wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> },
    );
    act(() => result.current.handleSave());
    await waitFor(() => expect(result.current.saveError).toBe("Save rejected before default"));
    await act(async () => resolveDefault("/tmp/late-default"));
    expect(result.current.draft.worktreePath).toBe("/tmp/late-default");
    // React Query schedules observer reset notifications on the next event-loop turn.
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.saveError).toBe("Save rejected before default");
  });

  it("preserves an edited path when task-prefix generation refreshes the project", async () => {
    renderDialog();
    const localPath = await screen.findByRole("textbox", { name: "Local path" });
    await waitFor(() => expect(localPath.getAttribute("value")).toBe("/tmp/current"));
    fireEvent.change(localPath, { target: { value: "/tmp/unsaved" } });
    act(() =>
      projectStore.setState({
        projects: projectStore.getState().projects.map((project) => ({ ...project, taskPrefix: "CORE" })),
      }),
    );
    await waitFor(() => expect(screen.getByText("CORE")).toBeTruthy());
    expect(localPath.getAttribute("value")).toBe("/tmp/unsaved");
  });

  it("loads fresh drafts on reopening and switching projects", () => {
    const getDefaultWorktreeLocation = vi.fn(async () => "/tmp/default");
    const projects = [
      { id: "one", name: "One", localPath: "/one", worktreePath: "/trees" },
      { id: "two", name: "Two", localPath: "/two", worktreePath: "/trees" },
    ];
    const { result, rerender } = renderHook(
      (props) =>
        useProjectConfigFormState({
          ...props,
          getDefaultWorktreeLocation,
        }),
      { initialProps: { open: true, repoId: "one", projects } },
    );
    act(() => result.current.setDraft((draft) => ({ ...draft, localPath: "/edited" })));
    rerender({ open: false, repoId: "one", projects });
    const refreshed = projects.map((project) => ({ ...project, localPath: `${project.localPath}/fresh` }));
    rerender({ open: true, repoId: "one", projects: refreshed });
    expect(result.current.draft.localPath).toBe("/one/fresh");
    rerender({ open: true, repoId: "two", projects: refreshed });
    expect(result.current.draft.localPath).toBe("/two/fresh");
  });

  it("does not overwrite edits or a new session with stale async defaults", async () => {
    let resolveDefault: (path: string) => void = () => {};
    const getDefaultWorktreeLocation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveDefault = resolve;
        }),
    );
    const projects = [
      { id: "one", name: "One", localPath: "/one", worktreePath: "" },
      { id: "two", name: "Two", localPath: "/two", worktreePath: "/two/trees" },
    ];
    const { result, rerender } = renderHook(
      (props) =>
        useProjectConfigFormState({
          ...props,
          projects,
          getDefaultWorktreeLocation,
        }),
      { initialProps: { open: true, repoId: "one" } },
    );
    act(() => result.current.setDraft((draft) => ({ ...draft, localPath: "/edited", worktreePath: "/chosen" })));
    await act(async () => resolveDefault("/default"));
    expect(result.current.draft.localPath).toBe("/edited");
    expect(result.current.draft.worktreePath).toBe("/chosen");
    rerender({ open: false, repoId: "one" });
    rerender({ open: true, repoId: "one" });
    const resolveStale = resolveDefault;
    rerender({ open: true, repoId: "two" });
    await act(async () => resolveStale("/stale"));
    expect(result.current.draft.localPath).toBe("/two");
    expect(result.current.draft.worktreePath).toBe("/two/trees");
  });
});
