import type { WorkspaceProjectRecord } from "@renderer/domains/project";
import { type WorkspaceItem, isFolderWorkspace } from "@renderer/domains/workspace";

/** A synthetic Local Task project mapped from a folder workspace. */
export type FolderWorkspaceProjectOption = WorkspaceProjectRecord & {
  icon: string;
  color: string;
};

/** Maps folder workspaces to their synthetic Local Task project records. */
export function getFolderWorkspaceProjectOptions(workspaces: WorkspaceItem[]): FolderWorkspaceProjectOption[] {
  return workspaces.flatMap((workspace) =>
    isFolderWorkspace(workspace)
      ? [
          {
            id: workspace.id,
            name: workspace.name,
            icon: "folder",
            color: "text.secondary",
          },
        ]
      : [],
  );
}

/** Merges renderer projects with synthetic folder projects, keyed by project ID. */
export function getLocalTaskProjectOptions(
  projects: WorkspaceProjectRecord[],
  workspaces: WorkspaceItem[],
): WorkspaceProjectRecord[] {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  for (const folderProject of getFolderWorkspaceProjectOptions(workspaces)) {
    projectsById.set(folderProject.id, folderProject);
  }
  return [...projectsById.values()];
}
