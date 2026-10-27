// @vitest-environment jsdom

import { workspaceStore } from "@renderer/domains/workspace";
import { initI18n } from "@renderer/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../state/projectStore";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";

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

describe("Project config local path", () => {
  it("edits the local draft and saves it separately from the new-workspace root", async () => {
    const { onClose } = renderDialog();
    const localPath = await screen.findByRole("textbox", { name: "Local path" });
    await waitFor(() => expect(localPath.getAttribute("value")).toBe("/tmp/current"));
    fireEvent.change(localPath, { target: { value: "/tmp/moved" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocked.updateProjectConfig).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          localPath: "/tmp/moved",
          worktreePath: "/tmp/worktrees",
        }),
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("initializes from legacy path and picks a folder using the current draft", async () => {
    // undefined is omitted by legacy projects.
    projectStore.setState({
      projects: projectStore.getState().projects.map((project) => ({ ...project, localPath: undefined })),
    });
    mocked.openLocalFolderDialog.mockResolvedValueOnce("/tmp/picked").mockResolvedValueOnce(null);
    renderDialog();
    const localPath = await screen.findByRole("textbox", { name: "Local path" });
    await waitFor(() => expect(localPath.getAttribute("value")).toBe("/tmp/fallback"));
    fireEvent.change(localPath, { target: { value: "/tmp/typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose local folder" }));
    await waitFor(() => expect(mocked.openLocalFolderDialog).toHaveBeenCalledWith("/tmp/typed"));
    await waitFor(() => expect(localPath.getAttribute("value")).toBe("/tmp/picked"));
    fireEvent.click(screen.getByRole("button", { name: "Choose local folder" }));
    await waitFor(() => expect(mocked.openLocalFolderDialog).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocked.updateProjectConfig).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          localPath: "/tmp/picked",
          worktreePath: "/tmp/worktrees",
        }),
      ),
    );
  });

  it("disables editing while saving and keeps a failed save visible and open until retry", async () => {
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
    for (const name of ["Choose local folder", "Choose worktree folder", "Open local path in Finder", "Cancel"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
    rejectSave(new Error("Path is unavailable"));
    expect((await screen.findByRole("alert")).textContent).toContain("Path is unavailable");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(localPath, { target: { value: "/tmp/retry" } });
    expect(screen.getByRole("alert").textContent).toContain("Path is unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("clears a save error when the existing config dialog is reopened", async () => {
    mocked.updateProjectConfig.mockRejectedValueOnce(new Error("Save rejected"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, queryClient, onClose } = renderDialog();
    await waitFor(() => expect(screen.getByDisplayValue("Core")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Save rejected");
    const renderWithOpen = (open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <ProjectConfigDialogView open={open} repoId="project-1" onClose={onClose} />
      </QueryClientProvider>
    );
    rerender(renderWithOpen(false));
    rerender(renderWithOpen(true));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("saves an unchanged empty remote path even when a legacy path exists", async () => {
    setProject("");
    const { onClose } = renderDialog();
    const localPath = await screen.findByRole("textbox", { name: "Local path" });
    await waitFor(() => expect(screen.getByDisplayValue("Core")).toBeTruthy());
    expect(localPath.getAttribute("value")).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocked.updateProjectConfig).toHaveBeenCalledWith("project-1", expect.objectContaining({ localPath: "" })),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
