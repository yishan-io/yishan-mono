import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import type { AppDb } from "@/db/client";
import { workspaces } from "@/db/schema";
import type { OrganizationService } from "@/services/organization-service";
import { ProjectService } from "@/services/project-service";

const INPUT = {
  organizationId: "org-1",
  projectId: "proj-1",
  actorUserId: "user-1",
  workspaceId: "ws-1",
  nodeId: "node-1",
  localPath: "/new/path",
  name: "Renamed",
};
const PROJECT = { id: "proj-1", name: "Renamed", organizationId: "org-1" };

function makeService(
  options: {
    hasWorkspace?: boolean;
    hasProject?: boolean;
    ownerUserId?: string;
    scope?: string;
    role?: "member" | null;
  } = {},
) {
  const workspaceSet = vi.fn();
  const projectSet = vi.fn();
  const workspaceWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(options.hasWorkspace === false ? [] : [{ id: "ws-1" }]),
  });
  const projectWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(options.hasProject === false ? [] : [PROJECT]),
  });
  const txUpdate = vi.fn((table: unknown) => ({
    set: (patch: unknown) => {
      if (table === workspaces) {
        workspaceSet(patch);
        return { where: workspaceWhere };
      }
      projectSet(patch);
      return { where: projectWhere };
    },
  }));
  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi
          .fn()
          .mockResolvedValue([
            { id: "node-1", ownerUserId: options.ownerUserId ?? "user-1", scope: options.scope ?? "private" },
          ]),
      }),
    }),
  });
  const rootUpdate = vi.fn();
  const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({ update: txUpdate }));
  const db = { update: rootUpdate, select, transaction } as unknown as AppDb;
  const organization = {
    getMembershipRole: vi.fn().mockResolvedValue(options.role === undefined ? "member" : options.role),
  } as unknown as OrganizationService;
  return {
    service: new ProjectService(db, organization),
    workspaceSet,
    projectSet,
    workspaceWhere,
    projectWhere,
    transaction,
    rootUpdate,
    txUpdate,
  };
}

function compileWhere(predicate: SQL) {
  return new PgDialect().sqlToQuery(predicate);
}

describe("ProjectService.updateProject primary path", () => {
  it("persists only the path and timestamp on the existing primary record and returns the project", async () => {
    const { service, workspaceSet, projectSet, workspaceWhere, transaction, rootUpdate, txUpdate } = makeService();
    await expect(service.updateProject(INPUT)).resolves.toEqual(PROJECT);
    expect(transaction).toHaveBeenCalledOnce();
    expect(rootUpdate).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledTimes(2);
    expect(workspaceSet).toHaveBeenCalledWith({ localPath: "/new/path", updatedAt: expect.any(Date) });
    expect(projectSet).toHaveBeenCalledWith({ name: "Renamed", updatedAt: expect.any(Date) });
    const predicate = compileWhere(workspaceWhere.mock.calls[0]?.[0]);
    expect(predicate.sql).toContain('"workspaces"."id" = $1');
    expect(predicate.sql).toContain('"workspaces"."organization_id" = $2');
    expect(predicate.sql).toContain('"workspaces"."project_id" = $3');
    expect(predicate.sql).toContain('"workspaces"."user_id" = $4');
    expect(predicate.sql).toContain('"workspaces"."node_id" = $5');
    expect(predicate.sql).toContain('"workspaces"."kind" = $6');
    expect(predicate.params).toEqual(["ws-1", "org-1", "proj-1", "user-1", "node-1", "primary"]);
  });

  it("rejects an unmatched workspace without saving project config", async () => {
    const { service, projectSet } = makeService({ hasWorkspace: false });
    await expect(service.updateProject(INPUT)).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    expect(projectSet).not.toHaveBeenCalled();
  });

  it("requires the project in the requested organization and wraps both writes in one transaction", async () => {
    const { service, transaction, projectWhere } = makeService({ hasProject: false });
    await expect(service.updateProject(INPUT)).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(transaction).toHaveBeenCalledOnce();
    const predicate = compileWhere(projectWhere.mock.calls[0]?.[0]);
    expect(predicate.sql).toContain('"projects"."id" = $1');
    expect(predicate.sql).toContain('"projects"."organization_id" = $2');
    expect(predicate.params).toEqual(["proj-1", "org-1"]);
  });

  it.each([
    { ownerUserId: "other-user", code: "WORKSPACE_LOCAL_NODE_PERMISSION_REQUIRED" },
    { scope: "shared", code: "WORKSPACE_LOCAL_NODE_SCOPE_INVALID" },
    { role: null, code: "ORGANIZATION_MEMBERSHIP_REQUIRED" },
  ])("rejects unauthorized path changes: $code", async ({ code, ...options }) => {
    const { service, workspaceSet, projectSet } = makeService(options);
    await expect(service.updateProject(INPUT)).rejects.toMatchObject({ code });
    expect(workspaceSet).not.toHaveBeenCalled();
    expect(projectSet).not.toHaveBeenCalled();
  });

  it.each([
    { localPath: "/new/path" },
    { workspaceId: "ws-1" },
    { nodeId: "node-1" },
    { localPath: "/new/path", workspaceId: "ws-1" },
    { localPath: "/new/path", nodeId: "node-1" },
    { workspaceId: "ws-1", nodeId: "node-1" },
    { localPath: "  ", workspaceId: "ws-1", nodeId: "node-1" },
    { localPath: "/new/path", workspaceId: "  ", nodeId: "node-1" },
    { localPath: "/new/path", workspaceId: "ws-1", nodeId: "  " },
    { localPath: "", workspaceId: "", nodeId: "" },
  ])("rejects incomplete or blank path triples without writes: %j", async (pathSelection) => {
    const { service, transaction, rootUpdate, txUpdate, workspaceSet, projectSet } = makeService();
    await expect(
      service.updateProject({
        organizationId: INPUT.organizationId,
        projectId: INPUT.projectId,
        actorUserId: INPUT.actorUserId,
        name: INPUT.name,
        ...pathSelection,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(transaction).not.toHaveBeenCalled();
    expect(rootUpdate).not.toHaveBeenCalled();
    expect(txUpdate).not.toHaveBeenCalled();
    expect(workspaceSet).not.toHaveBeenCalled();
    expect(projectSet).not.toHaveBeenCalled();
  });

  it("leaves all workspace state unchanged for config-only saves", async () => {
    const { service, workspaceSet, projectSet, transaction, rootUpdate, txUpdate } = makeService();
    await service.updateProject({
      organizationId: "org-1",
      projectId: "proj-1",
      actorUserId: "user-1",
      contextEnabled: false,
    });
    expect(workspaceSet).not.toHaveBeenCalled();
    expect(projectSet).toHaveBeenCalledWith({ contextEnabled: false, updatedAt: expect.any(Date) });
    expect(transaction).toHaveBeenCalledOnce();
    expect(rootUpdate).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledOnce();
  });
});
