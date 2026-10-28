import { describe, expect, it, vi } from "vitest";

import { updateProjectHandler } from "@/handlers/project";
import type { AppContext } from "@/hono";

describe("updateProjectHandler", () => {
  it("forwards primary workspace identity and path through the existing config save and keeps its response", async () => {
    const project = { id: "proj-1", name: "Renamed" };
    const updateProject = vi.fn().mockResolvedValue(project);
    const publishWorkspaceSnapshotChanged = vi.fn().mockResolvedValue(undefined);
    const services = { project: { updateProject }, relayEvent: { publishWorkspaceSnapshotChanged } };
    const json = vi.fn().mockReturnValue("response");
    const context = {
      get: (key: string) => (key === "sessionUser" ? { id: "user-1" } : services),
      json,
    } as unknown as AppContext;

    const response = await updateProjectHandler(
      context,
      { orgId: "org-1", projectId: "proj-1" },
      {
        name: "Renamed",
        localPath: "/new/path",
        workspaceId: "ws-1",
        nodeId: "node-1",
      },
    );

    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        organizationId: "org-1",
        projectId: "proj-1",
        name: "Renamed",
        localPath: "/new/path",
        workspaceId: "ws-1",
        nodeId: "node-1",
      }),
    );
    expect(json).toHaveBeenCalledWith({ project }, 200);
    expect(response).toBe("response");
    expect(publishWorkspaceSnapshotChanged).toHaveBeenCalledWith({
      organizationId: "org-1",
      resource: "project",
      change: "updated",
      projectId: "proj-1",
    });
  });
});
