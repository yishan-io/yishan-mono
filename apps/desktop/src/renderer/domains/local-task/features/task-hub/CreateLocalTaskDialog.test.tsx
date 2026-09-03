// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localTaskStore } from "../../state/localTaskStore";
import { DEFAULT_LOCAL_TASK_TEMPLATE, localTaskTemplateStore } from "../../state/localTaskTemplateStore";
import { CreateLocalTaskDialog } from "./CreateLocalTaskDialog";

const commands = vi.hoisted(() => ({
  createAndLinkLocalTask: vi.fn(),
  createLocalTask: vi.fn(),
  createLocalTaskTag: vi.fn(),
  linkLocalTaskWorkspace: vi.fn(),
  loadLocalTaskTagSuggestions: vi.fn(),
  loadLocalTaskTemplates: vi.fn(),
  saveLocalTaskTemplates: vi.fn(),
}));

vi.mock("../../commands/localTaskCommands", () => commands);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { error?: string }) => (values?.error ? `${key} ${values.error}` : key),
    i18n: { language: "en-US" },
  }),
}));
vi.mock("@renderer/domains/project", () => ({
  projectStore: (
    selector: (state: {
      projects: Array<{ id: string; name: string; organizationId: string; icon: string; color: string }>;
    }) => unknown,
  ) =>
    selector({
      projects: [
        {
          id: "project-1",
          name: "Renderer Project",
          organizationId: "organization-1",
          icon: "bug",
          color: "error.main",
        },
      ],
    }),
  renderProjectIcon: (icon: string | undefined) => <span data-testid="project-icon" data-icon={icon} />,
}));
const workspaceMocks = vi.hoisted(() => ({
  workspaces: [
    {
      id: "folder-workspace-1",
      repoId: "folder-project-1",
      projectId: "local-folder",
      name: "Local Folder",
      title: "Local Folder",
      sourceBranch: "",
      branch: "",
      summaryId: "folder-workspace-1",
      kind: "folder",
    },
  ],
}));
vi.mock("@renderer/domains/workspace", () => ({
  workspaceStore: (selector: (state: { workspaces: typeof workspaceMocks.workspaces }) => unknown) =>
    selector({ workspaces: workspaceMocks.workspaces }),
  isFolderWorkspace: (workspace: { kind: string }) => workspace.kind === "folder",
}));
vi.mock("@renderer/ui/components/VirtualizedListbox", () => ({
  VirtualizedListbox: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul {...props}>{children}</ul>
  ),
}));
vi.mock("./LocalTaskDescriptionEditor", () => ({
  LocalTaskDescriptionEditor: ({
    ariaLabel,
    disabled,
    onChange,
    placeholder,
    value,
  }: {
    ariaLabel: string;
    disabled: boolean;
    onChange: (markdown: string) => void;
    placeholder: string;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      data-testid="local-task-description-editor"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  ),
}));

const createdTask = {
  id: "task-created",
  key: "TASK-1",
  projectId: "project-1",
  title: "Created task",
  description: "Description",
  status: "progressing" as const,
  priority: "medium" as const,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  completedAt: null,
  hasActiveWorkspace: false,
  tags: [],
  tagRefs: [],
};
const initialState = localTaskStore.getState();

function renderDialog(workspaceId?: string) {
  return render(<CreateLocalTaskDialog open onClose={vi.fn()} workspaceId={workspaceId} />);
}

function getTitleInput() {
  return screen.getByRole("textbox", { name: "localTask.fields.title" });
}

function submitDialog() {
  const form = getTitleInput().closest("form");
  if (!form) throw new Error("Expected create task form");
  fireEvent.submit(form);
}

describe("CreateLocalTaskDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.createLocalTask.mockResolvedValue(undefined);
    commands.createLocalTaskTag.mockImplementation(async (name: string) => ({
      id: `tag-${name}`,
      key: name,
      name,
      aliases: [name],
      color: null,
    }));
    commands.createAndLinkLocalTask.mockResolvedValue({ status: "linked", task: createdTask });
    commands.linkLocalTaskWorkspace.mockResolvedValue(undefined);
    localTaskStore.setState({ ...initialState, tagCatalog: [] });
    localTaskTemplateStore
      .getState()
      .setTemplates(
        [DEFAULT_LOCAL_TASK_TEMPLATE, { id: "bug", name: "Bug", content: "## Reproduction\n\nSteps" }],
        "default",
      );
    localTaskTemplateStore.getState().setSelectedTemplateId("");
    commands.saveLocalTaskTemplates.mockImplementation(async (input) => {
      localTaskTemplateStore.getState().setTemplates(input.templates, input.agentDefaultId);
    });
  });

  afterEach(() => {
    cleanup();
    localTaskStore.setState(initialState, true);
    localTaskTemplateStore.getState().resetTemplates();
    window.localStorage.clear();
  });

  it("uses placeholder-backed accessible controls, icons, and a medium dialog", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("MuiDialog-paperWidthMd")).toBe(true);
    expect(getTitleInput().getAttribute("placeholder")).toBe("localTask.fields.title");
    expect(screen.getByRole("combobox", { name: "localTask.fields.project" }).getAttribute("placeholder")).toBe(
      "localTask.fields.project",
    );
    expect(screen.getByRole("textbox", { name: "localTask.fields.description" }).getAttribute("placeholder")).toBe(
      "localTask.fields.description",
    );
    expect(screen.getByRole("combobox", { name: "localTask.fields.tags" }).getAttribute("placeholder")).toBe(
      "localTask.fields.tags",
    );
    expect(screen.getByRole("combobox", { name: "localTask.fields.priority" })).toBeTruthy();
    expect(dialog.querySelector(".MuiInputLabel-root")).toBeNull();

    const projectInput = screen.getByRole("combobox", { name: "localTask.fields.project" });
    fireEvent.mouseDown(projectInput);
    const projectOption = screen.getByRole("option", { name: "Renderer Project" });
    expect(projectOption.querySelector('[data-testid="project-icon"]')).toBeTruthy();
    fireEvent.click(projectOption);
    expect(screen.getAllByTestId("project-icon")).toHaveLength(1);

    const prioritySelect = screen.getByRole("combobox", { name: "localTask.fields.priority" });
    expect(prioritySelect.querySelector('[data-testid="local-task-priority-icon"]')).toBeTruthy();
    fireEvent.mouseDown(prioritySelect);
    expect(screen.getAllByTestId("local-task-priority-icon")).toHaveLength(4);
  });

  it("prefills the editable Markdown description from the daemon agent-default template", async () => {
    renderDialog();

    await waitFor(() =>
      expect((screen.getByTestId("local-task-description-editor") as HTMLTextAreaElement).value).toContain("## Goal"),
    );
    expect(commands.loadLocalTaskTemplates).toHaveBeenCalled();
  });

  it("prefills the editable Markdown description from an explicitly selected template", async () => {
    localTaskTemplateStore.getState().setSelectedTemplateId("bug");
    renderDialog();

    await waitFor(() =>
      expect((screen.getByTestId("local-task-description-editor") as HTMLTextAreaElement).value).toBe(
        "## Reproduction\n\nSteps",
      ),
    );
  });

  it("renders tag options outside the dialog so they are not clipped by the description editor toolbar", () => {
    localTaskStore.setState({
      tagCatalog: [
        {
          id: "tag-backend",
          key: "backend",
          name: "Backend",
          aliases: ["Backend", "backend"],
          color: null,
        },
      ],
    });
    renderDialog();

    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.tags" }));

    expect(dialog.contains(screen.getByRole("option", { name: "Backend" }))).toBe(false);
  });

  it("selects a folder workspace as a project without sending an organization ID", async () => {
    renderDialog();
    fireEvent.change(getTitleInput(), { target: { value: "Folder task" } });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.project" }));
    fireEvent.click(screen.getByRole("option", { name: "Local Folder" }));

    submitDialog();

    await waitFor(() =>
      expect(commands.createLocalTask).toHaveBeenCalledWith({
        id: expect.any(String),
        projectId: "folder-workspace-1",
        projectKind: "folder",
        projectName: "Local Folder",
        organizationId: undefined,
        title: "Folder task",
        description: "",
        priority: "medium",
        tagIds: [],
      }),
    );
  });

  it("submits the selected metadata and Markdown emitted by the description editor", async () => {
    renderDialog();
    await waitFor(() =>
      expect((screen.getByTestId("local-task-description-editor") as HTMLTextAreaElement).value).toContain("## Goal"),
    );
    fireEvent.change(getTitleInput(), { target: { value: "  New task  " } });
    fireEvent.change(screen.getByTestId("local-task-description-editor"), { target: { value: "  **Markdown**  " } });
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.project" }));
    fireEvent.click(screen.getByRole("option", { name: "Renderer Project" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "localTask.fields.priority" }));
    fireEvent.click(screen.getByRole("option", { name: "localTask.priority.high" }));
    const tagsInput = screen.getByRole("combobox", { name: "localTask.fields.tags" });
    fireEvent.change(tagsInput, { target: { value: "Café" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });
    await waitFor(() => expect(commands.createLocalTaskTag).toHaveBeenCalledWith("Café"));

    submitDialog();

    await waitFor(() =>
      expect(commands.createLocalTask).toHaveBeenCalledWith({
        id: expect.any(String),
        projectId: "project-1",
        organizationId: "organization-1",
        title: "New task",
        description: "**Markdown**",
        priority: "high",
        tagIds: ["tag-Café"],
      }),
    );
  });

  it("confirms deletion of a selected template before saving or submitting the new task form", async () => {
    localTaskTemplateStore.getState().setSelectedTemplateId("bug");
    renderDialog();
    fireEvent.change(getTitleInput(), { target: { value: "Do not create" } });

    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.delete" }));

    expect(screen.getByRole("heading", { name: "localTask.templates.deleteTitle" })).toBeTruthy();
    expect(commands.saveLocalTaskTemplates).not.toHaveBeenCalled();
    expect(commands.createLocalTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "localTask.templates.confirmDelete" }));

    await waitFor(() =>
      expect(commands.saveLocalTaskTemplates).toHaveBeenCalledWith({
        templates: [DEFAULT_LOCAL_TASK_TEMPLATE],
        agentDefaultId: "default",
      }),
    );
    expect(commands.createLocalTask).not.toHaveBeenCalled();
  });

  it("disables every mutable control while a mutation is loading", () => {
    renderDialog();
    act(() => localTaskStore.setState({ isMutationLoading: true }));

    expect((getTitleInput() as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "localTask.fields.project" }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId("local-task-description-editor") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "localTask.fields.tags" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("combobox", { name: "localTask.fields.priority" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect((screen.getByRole("button", { name: "common.actions.cancel" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows command failures in the dialog", async () => {
    commands.createLocalTask.mockRejectedValueOnce(new Error("create failed"));
    renderDialog();
    fireEvent.change(getTitleInput(), { target: { value: "Broken task" } });

    submitDialog();

    expect((await screen.findByRole("alert")).textContent).toContain("create failed");
  });

  it("reuses the create attempt ID after a failed create", async () => {
    commands.createLocalTask.mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValueOnce(createdTask);
    renderDialog();
    fireEvent.change(getTitleInput(), { target: { value: "Retry task" } });

    submitDialog();
    await screen.findByRole("alert");
    submitDialog();

    await waitFor(() => expect(commands.createLocalTask).toHaveBeenCalledTimes(2));
    const [firstInput, secondInput] = commands.createLocalTask.mock.calls.map(([input]) => input);
    expect(firstInput.id).toEqual(expect.any(String));
    expect(secondInput.id).toBe(firstInput.id);
  });

  it("creates a new attempt ID after an externally controlled close and reopen", async () => {
    commands.createLocalTask.mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValueOnce(createdTask);
    const onClose = vi.fn();
    const { rerender } = render(<CreateLocalTaskDialog open onClose={onClose} />);
    fireEvent.change(getTitleInput(), { target: { value: "Retry after reopen" } });

    submitDialog();
    await screen.findByRole("alert");

    rerender(<CreateLocalTaskDialog open={false} onClose={onClose} />);
    rerender(<CreateLocalTaskDialog open onClose={onClose} />);
    submitDialog();

    await waitFor(() => expect(commands.createLocalTask).toHaveBeenCalledTimes(2));
    const [firstInput, secondInput] = commands.createLocalTask.mock.calls.map(([input]) => input);
    expect(secondInput.id).not.toBe(firstInput.id);
  });

  it("retains a created task and retries only its failed workspace link", async () => {
    commands.createAndLinkLocalTask.mockResolvedValueOnce({
      status: "created",
      task: createdTask,
      linkError: "link failed",
    });
    renderDialog("workspace-1");
    fireEvent.change(getTitleInput(), { target: { value: "Created task" } });

    submitDialog();
    expect((await screen.findByRole("alert")).textContent).toContain("link failed");
    submitDialog();

    await waitFor(() => expect(commands.linkLocalTaskWorkspace).toHaveBeenCalledWith("task-created", "workspace-1"));
    expect(commands.createAndLinkLocalTask).toHaveBeenCalledTimes(1);
  });
});
