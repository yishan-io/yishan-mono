// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addWorkspace: vi.fn(),
  activateWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  enqueueWorkspaceErrorNotice: vi.fn(),
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
  getWorkspaceRpc: vi.fn(),
  projectState: { projects: [] as Array<Record<string, unknown>> },
  sessionState: { selectedOrganizationId: "org-1" },
  startWorkspaceCreateProgress: vi.fn(),
}));

vi.mock("@renderer/domains/project", () => ({ projectStore: { getState: () => mocks.projectState } }));
vi.mock("@renderer/domains/workbench", () => ({ activateWorkspace: mocks.activateWorkspace }));
vi.mock("@renderer/domains/session", () => ({ sessionStore: { getState: () => mocks.sessionState } }));
vi.mock("../../../domains/workspace/state/workspaceCreateProgressStore", () => ({
  workspaceCreateProgressStore: {
    getState: () => ({ startWorkspaceCreateProgress: mocks.startWorkspaceCreateProgress }),
  },
}));
vi.mock("../../../domains/workspace/state/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: mocks.enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings: mocks.enqueueWorkspaceLifecycleWarnings,
}));
vi.mock("../daemon/daemonWorkspaceClient", () => ({ getWorkspaceRpc: mocks.getWorkspaceRpc }));
vi.mock("../state/workspaceSettingsStore", () => ({
  workspaceSettingsStore: { getState: () => ({ isDefaultContextEnabled: true }) },
}));
vi.mock("../state/workspaceStore", () => ({
  workspaceStore: { getState: () => ({ addWorkspace: mocks.addWorkspace }) },
}));
vi.mock("../state/workspaceStoreMutations", () => ({
  normalizeCreateWorkspaceInput: (input: { name: string }) => ({ normalizedName: input.name.trim() }),
}));

import { createWorkspace, notifyLifecycleScriptWarnings } from "./workspaceCreateCommand";

afterEach(() => {
  mocks.projectState.projects = [];
  mocks.sessionState.selectedOrganizationId = "org-1";
  vi.clearAllMocks();
});

describe("createWorkspace", () => {
  it.each([
    [
      "organization",
      () => {
        mocks.sessionState.selectedOrganizationId = "";
      },
      "Select an organization before creating a workspace.",
    ],
    [
      "repo key",
      () => {
        mocks.projectState.projects = [{ id: "project-1", localPath: "/projects/one" }];
      },
      "The selected project is missing its repository key.",
    ],
    [
      "local path",
      () => {
        mocks.projectState.projects = [{ id: "project-1", repoKey: "repo-1" }];
      },
      "The selected project is missing its local path.",
    ],
  ])("shows a visible error when the %s prerequisite is missing", async (_prerequisite, setup, message) => {
    setup();

    await createWorkspace({ projectId: "project-1", name: "new-workspace", sourceBranch: "main" });

    expect(mocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({ title: "Failed to create workspace", message });
    expect(mocks.getWorkspaceRpc).not.toHaveBeenCalled();
  });

  it("accepts creation without adding or activating a renderer workspace row", async () => {
    mocks.projectState.projects = [{ id: "project-1", repoKey: "repo-1", localPath: "/projects/one" }];
    mocks.getWorkspaceRpc.mockResolvedValue({ createWorkspace: mocks.createWorkspace });
    mocks.createWorkspace.mockResolvedValue({ workspaceId: "workspace-created" });

    await expect(
      createWorkspace({ projectId: "project-1", name: "new-workspace", sourceBranch: "main" }),
    ).resolves.toBe("workspace-created");

    expect(mocks.startWorkspaceCreateProgress).toHaveBeenCalledWith("workspace-created");
    expect(mocks.addWorkspace).not.toHaveBeenCalled();
    expect(mocks.activateWorkspace).not.toHaveBeenCalled();
  });

  it("shows a visible error when a requested node cannot be used", async () => {
    mocks.projectState.projects = [{ id: "project-1", repoKey: "repo-1", localPath: "/projects/one" }];
    mocks.getWorkspaceRpc.mockResolvedValue({ createWorkspace: mocks.createWorkspace });
    mocks.createWorkspace.mockRejectedValue(new Error("Selected node is offline"));

    await createWorkspace({ projectId: "project-1", name: "new-workspace", sourceBranch: "main", nodeId: "node-1" });

    expect(mocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
      title: "Failed to create workspace",
      message: "Selected node is offline",
    });
  });
});

describe("notifyLifecycleScriptWarnings", () => {
  it("does nothing when warnings are absent", () => {
    notifyLifecycleScriptWarnings("workspace-1", undefined, "setup", "yarn setup");
    notifyLifecycleScriptWarnings("workspace-1", [], "setup", "yarn setup");

    expect(mocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("normalizes structured warnings and enqueues them", () => {
    notifyLifecycleScriptWarnings(
      "workspace-1",
      [
        {
          scriptKind: "setup",
          timedOut: true,
          message: "setup timed out",
          command: "yarn setup",
          stdoutExcerpt: "out",
          stderrExcerpt: "err",
          exitCode: null,
          signal: null,
          logFilePath: "/tmp/setup.log",
        },
      ],
      "setup",
      "fallback-cmd",
    );

    expect(mocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
      workspaceName: "workspace-1",
      warnings: [
        {
          scriptKind: "setup",
          timedOut: true,
          message: "setup timed out",
          command: "yarn setup",
          stdoutExcerpt: "out",
          stderrExcerpt: "err",
          exitCode: null,
          signal: null,
          logFilePath: "/tmp/setup.log",
        },
      ],
    });
  });

  it("normalizes legacy plain-string warnings with the fallback kind and command", () => {
    // Runtime accepts legacy plain strings; typed as the structured shape via a cast.
    notifyLifecycleScriptWarnings(
      "workspace-1",
      ["setup script failed"] as unknown as Parameters<typeof notifyLifecycleScriptWarnings>[1],
      "post",
      "fallback-cmd",
    );

    expect(mocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
      workspaceName: "workspace-1",
      warnings: [
        {
          scriptKind: "post",
          timedOut: false,
          message: "setup script failed",
          command: "fallback-cmd",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
      ],
    });
  });

  it("fills missing fields on partially structured warnings", () => {
    notifyLifecycleScriptWarnings(
      "workspace-1",
      [
        {
          scriptKind: "setup" as const,
          message: "partial",
          // @ts-expect-error intentionally incomplete record passed through normalization
          command: null,
        },
      ],
      "setup",
      "fallback-cmd",
    );

    expect(mocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
      workspaceName: "workspace-1",
      warnings: [
        {
          scriptKind: "setup",
          timedOut: false,
          message: "partial",
          command: "fallback-cmd",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
      ],
    });
  });

  it("maps multiple structured warnings in order", () => {
    notifyLifecycleScriptWarnings(
      "workspace-1",
      [
        {
          scriptKind: "setup",
          timedOut: false,
          message: "first",
          command: "c1",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
        {
          scriptKind: "setup",
          timedOut: false,
          message: "second",
          command: "c2",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
      ],
      "setup",
      "fallback-cmd",
    );

    const call = mocks.enqueueWorkspaceLifecycleWarnings.mock.calls[0];
    expect(call?.[0].warnings.map((warning: { message: string }) => warning.message)).toEqual(["first", "second"]);
  });
});
