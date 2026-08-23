import type { AppDb } from "@/db/client";
import { ProjectAlreadyExistsError, ProjectCreateFailedError } from "@/errors";
import { ProjectService } from "@/services/project-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workspacePullRequestMocks = vi.hoisted(() => ({
  fetchLatestPrByWorkspaceId: vi.fn(),
}));

vi.mock("@/services/workspace-pull-request-service", () => ({
  fetchLatestPrByWorkspaceId: workspacePullRequestMocks.fetchLatestPrByWorkspaceId,
}));

const PROJECT_ROW = {
  id: "proj-1",
  name: "Project 1",
  sourceType: "git" as const,
  repoProvider: "github",
  repoUrl: "https://github.com/acme/project-1.git",
  repoKey: "acme/project-1",
  icon: "folder",
  color: "#111111",
  setupScript: "",
  postScript: "",
  commands: [],
  contextEnabled: true,
  organizationId: "org-1",
  createdByUserId: "user-1",
  createdAt: new Date("2026-06-28T00:00:00Z"),
  updatedAt: new Date("2026-06-28T00:00:00Z"),
};

function makeOrgService(role: string | null = "member") {
  // biome-ignore lint/suspicious/noExplicitAny: stub
  return { getMembershipRole: vi.fn().mockResolvedValue(role) } as any;
}

function makeCreateDb(
  options: {
    insertedProject?: unknown;
    insertedWorkspace?: unknown;
    projectInsertError?: unknown;
    workspaceInsertError?: unknown;
    transactionError?: unknown;
  } = {},
) {
  const { insertedProject, insertedWorkspace, projectInsertError, workspaceInsertError, transactionError } = options;

  // Outer db: handles assertNodeOwnedByActor (uses this.db directly)
  const outerLimit = vi.fn().mockResolvedValue([{ id: "node-1", scope: "private", ownerUserId: "user-1" }]);
  const outerSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: outerLimit }) }),
  });

  // Transaction inner tx: projects insert first, then the primary workspace insert.
  let txInsertCall = 0;
  const txInsertReturning = vi.fn().mockImplementation(() => {
    txInsertCall += 1;
    if (txInsertCall === 1 && projectInsertError) return Promise.reject(projectInsertError);
    if (txInsertCall === 2 && workspaceInsertError) return Promise.reject(workspaceInsertError);
    if (txInsertCall === 1) return Promise.resolve([insertedProject]);
    return Promise.resolve([insertedWorkspace]);
  });
  const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
  const transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const transactionResult = await fn({ insert: txInsert });
    if (transactionError) throw transactionError;
    return transactionResult;
  });

  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  const db = { select: outerSelect, transaction } as any;

  return { db, outerSelect, txInsert, txInsertValues, txInsertReturning };
}

function makeListProjectsDb(workspaceRows: unknown[]) {
  let selectCall = 0;
  const where = vi.fn().mockImplementation(() => {
    selectCall += 1;
    if (selectCall === 1) {
      return Promise.resolve([PROJECT_ROW]);
    }
    return Promise.resolve(workspaceRows);
  });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select } as unknown as AppDb;
}

describe("ProjectService.listProjects", () => {
  beforeEach(() => {
    workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockReset();
    workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockResolvedValue(new Map());
  });

  it("includes provisioning workspaces when hydrating projects", async () => {
    const provisioningWorkspace = {
      id: "ws-1",
      organizationId: "org-1",
      projectId: "proj-1",
      userId: "user-1",
      nodeId: "node-1",
      kind: "worktree" as const,
      status: "provisioning" as const,
      branch: "feature-a",
      sourceBranch: "main",
      localPath: "",
      createdAt: new Date("2026-06-28T00:00:00Z"),
      updatedAt: new Date("2026-06-28T00:00:00Z"),
    };
    const service = new ProjectService(makeListProjectsDb([provisioningWorkspace]), makeOrgService("member"));

    const result = await service.listProjects({
      organizationId: "org-1",
      actorUserId: "user-1",
      withWorkspaces: true,
    });

    expect(result).toEqual([
      {
        ...PROJECT_ROW,
        workspaces: [{ ...provisioningWorkspace, latestPullRequest: null }],
      },
    ]);
    expect(workspacePullRequestMocks.fetchLatestPrByWorkspaceId).toHaveBeenCalledWith(expect.anything(), "org-1", [
      "ws-1",
    ]);
  });
});

describe("ProjectService.createProject", () => {
  beforeEach(() => {
    workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockReset();
    workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockResolvedValue(new Map());
  });

  it("creates an unknown-source project with one primary workspace for a non-git local folder", async () => {
    const insertedProject = {
      ...PROJECT_ROW,
      id: "proj-2",
      sourceType: "unknown" as const,
      repoProvider: null,
      repoUrl: null,
      repoKey: null,
    };
    const insertedWorkspace = {
      id: "ws-1",
      organizationId: "org-1",
      projectId: "proj-2",
      userId: "user-1",
      nodeId: "node-1",
      kind: "primary" as const,
      status: "active" as const,
      branch: null,
      localPath: "/plain/folder",
      createdAt: new Date("2026-06-28T00:00:00Z"),
      updatedAt: new Date("2026-06-28T00:00:00Z"),
    };
    const { db } = makeCreateDb({ insertedProject, insertedWorkspace });
    const service = new ProjectService(db, makeOrgService("member"));

    const result = await service.createProject({
      organizationId: "org-1",
      actorUserId: "user-1",
      name: "Plain Folder",
      sourceTypeHint: "unknown",
      nodeId: "node-1",
      localPath: "/plain/folder",
    });

    expect(result.sourceType).toBe("unknown");
    expect(result.repoKey).toBeNull();
    expect(result.workspaces).toEqual([{ ...insertedWorkspace, latestPullRequest: null }]);
  });

  it("converts a direct duplicate Git identity violation into ProjectAlreadyExistsError", async () => {
    const projectInsertError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "projects_org_repo_provider_key_uq",
    });
    const { db } = makeCreateDb({ projectInsertError });
    const service = new ProjectService(db, makeOrgService("member"));

    const creation = service.createProject({
      organizationId: "org-1",
      actorUserId: "user-1",
      name: "Project 1",
      repoUrl: "https://github.com/acme/project-1.git",
    });

    await expect(creation).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
    await expect(creation).rejects.toMatchObject({
      status: 409,
      code: "PROJECT_ALREADY_EXISTS",
      details: { organizationId: "org-1", repoProvider: "github", repoKey: "acme/project-1" },
    });
  });

  it("converts a duplicate Git identity unique violation into ProjectAlreadyExistsError", async () => {
    const { db } = makeCreateDb({
      projectInsertError: new Error("Failed query", {
        cause: { code: "23505", constraint: "projects_org_repo_provider_key_uq" },
      }),
    });
    const service = new ProjectService(db, makeOrgService("member"));

    const creation = service.createProject({
      organizationId: "org-1",
      actorUserId: "user-1",
      name: "Project 1",
      repoUrl: "https://github.com/acme/project-1.git",
    });

    await expect(creation).rejects.toBeInstanceOf(ProjectAlreadyExistsError);
    await expect(creation).rejects.toMatchObject({
      status: 409,
      code: "PROJECT_ALREADY_EXISTS",
      details: { organizationId: "org-1", repoProvider: "github", repoKey: "acme/project-1" },
    });
  });

  it.each([
    { code: "23505", constraint: "other_unique_constraint" },
    { code: "other_error_code", constraint: "projects_org_repo_provider_key_uq" },
  ])(
    "converts a nonmatching wrapped violation into ProjectCreateFailedError and preserves its cause",
    async (cause) => {
      const projectInsertError = new Error("Failed query", { cause });
      const { db } = makeCreateDb({ projectInsertError });
      const service = new ProjectService(db, makeOrgService("member"));

      const creation = service.createProject({
        organizationId: "org-1",
        actorUserId: "user-1",
        name: "Project 1",
        repoUrl: "https://github.com/acme/project-1.git",
      });

      await expect(creation).rejects.toBeInstanceOf(ProjectCreateFailedError);
      await expect(creation).rejects.toMatchObject({
        status: 500,
        code: "PROJECT_CREATE_FAILED",
        cause: projectInsertError,
      });
    },
  );

  it("converts a primary workspace insert failure into ProjectCreateFailedError and preserves its cause", async () => {
    const workspaceInsertError = new Error("primary workspace insert failed");
    const { db } = makeCreateDb({ insertedProject: PROJECT_ROW, workspaceInsertError });
    const service = new ProjectService(db, makeOrgService("member"));

    const creation = service.createProject({
      organizationId: "org-1",
      actorUserId: "user-1",
      name: "Project 1",
      nodeId: "node-1",
      localPath: "/project-1",
    });

    await expect(creation).rejects.toBeInstanceOf(ProjectCreateFailedError);
    await expect(creation).rejects.toMatchObject({ cause: workspaceInsertError });
  });

  it("converts a transaction commit failure into ProjectCreateFailedError and preserves its cause", async () => {
    const transactionError = new Error("transaction commit failed");
    const { db } = makeCreateDb({ insertedProject: PROJECT_ROW, transactionError });
    const service = new ProjectService(db, makeOrgService("member"));

    const creation = service.createProject({
      organizationId: "org-1",
      actorUserId: "user-1",
      name: "Project 1",
    });

    await expect(creation).rejects.toBeInstanceOf(ProjectCreateFailedError);
    await expect(creation).rejects.toMatchObject({ cause: transactionError });
  });

  it("throws ProjectCreateFailedError when the insert returns no project", async () => {
    const { db } = makeCreateDb();
    const service = new ProjectService(db, makeOrgService("member"));

    await expect(
      service.createProject({
        organizationId: "org-1",
        actorUserId: "user-1",
        name: "Project 1",
      }),
    ).rejects.toBeInstanceOf(ProjectCreateFailedError);
  });
});
