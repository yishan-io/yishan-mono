// @vitest-environment jsdom
import { sessionStore } from "@renderer/domains/session";
import { workspaceStore } from "@renderer/domains/workspace";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../state/projectStore";
import { updateProjectConfig } from "./projectCommands";

const mocks = vi.hoisted(() => ({ requestJson: vi.fn(), request: vi.fn() }));
vi.mock("@renderer/api/restClient", () => ({ requestJson: mocks.requestJson }));
vi.mock("@renderer/rpc/client", () => ({
  request: mocks.request,
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
}));

beforeEach(() => {
  vi.resetAllMocks();
  sessionStore.setState({ selectedOrganizationId: "org", daemonId: "node", currentUserId: "actor" });
  projectStore.setState({
    projects: [
      {
        id: "project",
        name: "Old",
        organizationId: "org",
        localPath: "/old",
        path: "/old",
        worktreePath: "/worktrees",
        contextEnabled: false,
        taskPrefix: "KEEP",
        repoKey: "stable",
      },
    ],
  });
  workspaceStore.setState({
    workspaces: [
      {
        id: "primary",
        projectId: "project",
        repoId: "project",
        kind: "local",
        nodeId: "node",
        name: "local",
        title: "local",
        branch: "main",
        sourceBranch: "main",
        summaryId: "summary",
        worktreePath: "/old",
        state: "error",
        health: "path-missing",
      },
    ],
  });
  mocks.requestJson.mockResolvedValue({ project: { name: "Saved", contextEnabled: false } });
  mocks.request.mockImplementation(async (method: string) => {
    if (method === "git.inspectPath") return { isGitRepository: true, repositoryRoot: "/new" };
    if (method === "workspace.openProject") return { opened: ["primary"], skipped: [], errors: [] };
    return {};
  });
});

// Keep calls typed against the command so this also verifies its public input contract.
const savePath = (localPath = "/new") => updateProjectConfig("project", { name: "Saved", localPath });

describe("project config primary path", () => {
  it("validates then PUTs the path and stable IDs before awaiting daemon reconciliation", async () => {
    let finishOpen!: (value: unknown) => void;
    mocks.request.mockImplementation(async (method: string) => {
      if (method === "git.inspectPath") return { isGitRepository: true, repositoryRoot: "/new" };
      return new Promise((resolve) => {
        finishOpen = resolve;
      });
    });
    const saving = savePath(" /alias/subdir/ ");
    await vi.waitFor(() => expect(finishOpen).toBeTypeOf("function"));
    expect(mocks.requestJson).toHaveBeenCalledWith("/orgs/org/projects/project", {
      method: "PUT",
      body: expect.objectContaining({ name: "Saved", localPath: "/new", workspaceId: "primary", nodeId: "node" }),
    });
    expect(mocks.request).toHaveBeenCalledWith("git.inspectPath", { path: "/alias/subdir/" });
    expect(mocks.request).toHaveBeenCalledWith("workspace.openProject", {
      workspaces: [
        {
          workspaceId: "primary",
          worktreePath: "/new",
          projectId: "project",
          orgId: "org",
          kind: "primary",
        },
      ],
    });
    expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.requestJson.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.requestJson.mock.invocationCallOrder[0]).toBeLessThan(mocks.request.mock.invocationCallOrder[1] ?? 0);
    expect(projectStore.getState().projects[0]?.localPath).toBe("/old");
    finishOpen({ opened: ["primary"], skipped: [], errors: [] });
    await saving;
    expect(projectStore.getState().projects[0]).toMatchObject({
      id: "project",
      name: "Saved",
      localPath: "/new",
      path: "/new",
      worktreePath: "/worktrees",
      taskPrefix: "KEEP",
      repoKey: "stable",
    });
    expect(workspaceStore.getState().workspaces).toHaveLength(1);
    expect(workspaceStore.getState().workspaces[0]).toMatchObject({
      id: "primary",
      projectId: "project",
      nodeId: "node",
      kind: "local",
      summaryId: "summary",
      worktreePath: "/new",
      state: "active",
    });
    expect(workspaceStore.getState().workspaces[0]?.health).toBeUndefined();
  });

  it.each([undefined, " /old "])("preserves config-only behavior for unchanged/absent path %s", async (localPath) => {
    await updateProjectConfig("project", { name: "Saved", worktreePath: "/preference", localPath });
    const body = mocks.requestJson.mock.calls[0]?.[1]?.body;
    expect(body).not.toHaveProperty("localPath");
    expect(body).not.toHaveProperty("workspaceId");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(projectStore.getState().projects[0]).toMatchObject({
      name: "Saved",
      localPath: "/old",
      path: "/old",
      worktreePath: "/preference",
    });
  });

  it("allows an unchanged empty remote path without inspection or path payload", async () => {
    projectStore.setState({
      projects: projectStore.getState().projects.map((project) => ({
        ...project,
        localPath: undefined,
        path: undefined,
        source: "remote",
        gitUrl: "https://example.com/project",
      })),
    });
    workspaceStore.setState({ workspaces: [] });
    await savePath("  ");
    expect(mocks.requestJson.mock.calls[0]?.[1]?.body).not.toHaveProperty("localPath");
    expect(mocks.request).not.toHaveBeenCalled();
    expect(projectStore.getState().projects[0]?.name).toBe("Saved");
  });

  it("selects the current daemon primary even when a foreign primary comes first", async () => {
    const primary = workspaceStore.getState().workspaces[0];
    if (!primary) throw new Error("Expected a primary workspace fixture");
    workspaceStore.setState({ workspaces: [{ ...primary, id: "foreign", nodeId: "foreign-node" }, primary] });
    await savePath();
    expect(mocks.requestJson.mock.calls[0]?.[1]?.body).toMatchObject({ workspaceId: "primary", nodeId: "node" });
    expect(workspaceStore.getState().workspaces[0]?.worktreePath).toBe("/old");
    expect(workspaceStore.getState().workspaces[1]?.worktreePath).toBe("/new");
  });

  it.each(["inspection", "PUT", "config PUT", "reconcile"])(
    "invalidates scope changes during %s, including away and back",
    async (stage) => {
      for (const field of ["currentUserId", "selectedOrganizationId", "daemonId"] as const) {
        for (const shouldReturn of [false, true]) {
          const original = sessionStore.getState()[field];
          let finish!: () => void;
          const pending = new Promise<void>((resolve) => {
            finish = resolve;
          });
          mocks.request.mockImplementation(async (method: string) => {
            if (
              (stage === "inspection" && method === "git.inspectPath") ||
              (stage === "reconcile" && method === "workspace.openProject")
            )
              await pending;
            return method === "git.inspectPath"
              ? { isGitRepository: true, repositoryRoot: "/new" }
              : { opened: ["primary"], errors: [] };
          });
          mocks.requestJson.mockImplementation(async () => {
            if (stage === "PUT" || stage === "config PUT") await pending;
            return { project: { name: "Saved", contextEnabled: true, repoKey: "stable" } };
          });
          mocks.request.mockClear();
          mocks.requestJson.mockClear();
          const saving = updateProjectConfig("project", {
            name: "Saved",
            localPath: stage === "config PUT" ? undefined : "/new",
            contextEnabled: true,
          });
          await vi.waitFor(() => {
            if (stage === "inspection")
              expect(mocks.request).toHaveBeenCalledWith("git.inspectPath", expect.anything());
            if (stage === "PUT" || stage === "config PUT") expect(mocks.requestJson).toHaveBeenCalledTimes(1);
            if (stage === "reconcile")
              expect(mocks.request).toHaveBeenCalledWith("workspace.openProject", expect.anything());
          });
          sessionStore.setState({ [field]: "changed" });
          if (shouldReturn) sessionStore.setState({ [field]: original });
          finish();
          await saving;
          if (stage === "inspection") expect(mocks.requestJson).not.toHaveBeenCalled();
          if (stage !== "reconcile")
            expect(mocks.request.mock.calls.map(([method]) => method)).toEqual(
              stage === "config PUT" ? [] : ["git.inspectPath"],
            );
          expect(mocks.request).not.toHaveBeenCalledWith("workspace.syncContextLink", expect.anything());
          expect(projectStore.getState().projects[0]).toMatchObject({
            name: "Old",
            localPath: "/old",
            contextEnabled: false,
          });
          expect(workspaceStore.getState().workspaces[0]?.worktreePath).toBe("/old");
          sessionStore.setState({ [field]: original });
        }
      }
    },
  );

  it("rejects invalid git target before any API save", async () => {
    mocks.request.mockResolvedValue({ isGitRepository: false });
    await expect(savePath()).rejects.toThrow(/git/i);
    expect(mocks.requestJson).not.toHaveBeenCalled();
    expect(projectStore.getState().projects[0]?.localPath).toBe("/old");
  });

  it.each([undefined, "", "   "])("rejects missing canonical root %s from older daemons", async (repositoryRoot) => {
    mocks.request.mockResolvedValue({ isGitRepository: true, repositoryRoot });
    await expect(savePath()).rejects.toThrow(/canonical.*root.*daemon/i);
    expect(mocks.requestJson).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.map(([method]) => method)).toEqual(["git.inspectPath"]);
    expect(projectStore.getState().projects[0]?.localPath).toBe("/old");
    expect(workspaceStore.getState().workspaces[0]?.worktreePath).toBe("/old");
  });

  it("rejects inspection failures before API save", async () => {
    mocks.request.mockRejectedValue(new Error("missing directory"));
    await expect(savePath()).rejects.toThrow("missing directory");
    expect(mocks.requestJson).not.toHaveBeenCalled();
  });

  it.each(["errors", "transport"])("rejects daemon %s after backend save and allows retry", async (failure) => {
    mocks.request.mockImplementation(async (method: string) => {
      if (method === "git.inspectPath") return { isGitRepository: true, repositoryRoot: "/new" };
      if (failure === "transport") throw new Error("daemon unavailable");
      return { opened: [], skipped: [], errors: ["path sync failed"] };
    });
    await expect(savePath()).rejects.toThrow(/sync failed|unavailable/);
    expect(mocks.requestJson).toHaveBeenCalledTimes(1);
    expect(projectStore.getState().projects[0]?.localPath).toBe("/old");
    expect(workspaceStore.getState().workspaces[0]).toMatchObject({ worktreePath: "/old", state: "error" });
    mocks.request.mockImplementation(async (method: string) =>
      method === "git.inspectPath"
        ? { isGitRepository: true, repositoryRoot: "/new" }
        : { opened: [], skipped: ["primary"], errors: [] },
    );
    await savePath();
    expect(mocks.requestJson).toHaveBeenCalledTimes(2);
    expect(projectStore.getState().projects[0]?.localPath).toBe("/new");
  });

  it("retries daemon sync when a backend snapshot already has the new project path", async () => {
    projectStore.setState({
      projects: projectStore.getState().projects.map((project) => ({ ...project, localPath: "/new", path: "/new" })),
    });
    await savePath();
    expect(mocks.requestJson.mock.calls[0]?.[1]?.body).toMatchObject({ localPath: "/new", workspaceId: "primary" });
    expect(workspaceStore.getState().workspaces[0]?.worktreePath).toBe("/new");
  });

  it("does not report success for an unconfirmed daemon result", async () => {
    mocks.request.mockImplementation(async (method: string) =>
      method === "git.inspectPath"
        ? { isGitRepository: true, repositoryRoot: "/new" }
        : { opened: [], skipped: [], errors: [] },
    );
    await expect(savePath()).rejects.toThrow(/did not confirm/);
    expect(projectStore.getState().projects[0]?.localPath).toBe("/old");
  });

  it("does not reconcile when the backend rejects", async () => {
    mocks.requestJson.mockRejectedValue(new Error("API denied"));
    await expect(savePath()).rejects.toThrow("API denied");
    expect(mocks.request.mock.calls.map(([method]) => method)).toEqual(["git.inspectPath"]);
  });

  it.each(["no-org", "no-primary", "managed", "no-node", "foreign-node", "blank"])(
    "rejects %s without a save",
    async (scenario) => {
      if (scenario === "no-org") sessionStore.setState({ selectedOrganizationId: undefined });
      if (scenario === "no-primary") workspaceStore.setState({ workspaces: [] });
      if (scenario === "managed")
        workspaceStore.setState({
          workspaces: workspaceStore.getState().workspaces.map((ws) => ({ ...ws, kind: "managed" })),
        });
      if (scenario === "no-node") sessionStore.setState({ daemonId: undefined });
      if (scenario === "foreign-node") sessionStore.setState({ daemonId: "another-host" });
      await expect(savePath(scenario === "blank" ? "  " : "/new")).rejects.toThrow();
      expect(mocks.requestJson).not.toHaveBeenCalled();
      expect(projectStore.getState().projects[0]?.localPath).toBe("/old");
    },
  );
});
