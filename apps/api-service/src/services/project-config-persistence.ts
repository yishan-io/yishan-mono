import { and, eq } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { projects, workspaces } from "@/db/schema";
import { ProjectNotFoundError, ValidationError, WorkspaceNotFoundError } from "@/errors";
import type { ProjectView, UpdateProjectInput } from "@/services/project-types";
import { assertNodeOwnedByActor } from "@/services/shared/assertNodeOwnedByActor";

/** Persists project config and an optional primary workspace path after membership authorization. */
export async function persistProjectConfig(db: AppDb, input: UpdateProjectInput): Promise<ProjectView> {
  const { organizationId, actorUserId, projectId, localPath, workspaceId, nodeId, ...updates } = input;

  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  ) as Partial<
    Pick<ProjectView, "name" | "icon" | "color" | "setupScript" | "postScript" | "commands" | "contextEnabled">
  >;

  if (localPath !== undefined || workspaceId !== undefined || nodeId !== undefined) {
    if (!localPath?.trim() || !workspaceId?.trim() || !nodeId?.trim()) {
      throw new ValidationError([
        {
          path: "localPath",
          message: "Non-empty localPath, workspaceId and nodeId are required together",
          code: "custom",
        },
      ]);
    }
    await assertNodeOwnedByActor(db, nodeId, actorUserId);
  }
  return await db.transaction(async (tx) => {
    if (localPath !== undefined && workspaceId !== undefined && nodeId !== undefined) {
      const updatedWorkspaces = await tx
        .update(workspaces)
        .set({ localPath: localPath.trim(), updatedAt: new Date() })
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.organizationId, organizationId),
            eq(workspaces.projectId, projectId),
            eq(workspaces.userId, actorUserId),
            eq(workspaces.nodeId, nodeId),
            eq(workspaces.kind, "primary"),
          ),
        )
        .returning({ id: workspaces.id });
      if (!updatedWorkspaces[0]) {
        throw new WorkspaceNotFoundError({ workspaceId, projectId });
      }
    }
    const updatedRows = await tx
      .update(projects)
      .set({ ...filteredUpdates, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
      .returning();
    const project = updatedRows[0];
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }
    return project;
  });
}
