import { gitProjectionStore, inspectGitRepositoryPath } from "@renderer/domains/git";
import { isFolderWorkspace, workspaceStore } from "@renderer/domains/workspace";

import { promoteGitLocalProject } from "../commands/projectCommands";
import { projectStore } from "../state/projectStore";

/** Rechecks git-local projects when Git watcher projections report a path change. */
export function createGitLocalProjectPromotionRuntime() {
  const promotionProjectIds = new Set<string>();
  let lastVersionByWorktreePath: Record<string, number> | undefined;

  async function checkGitLocalProjects(changedWorktreePaths?: Set<string>): Promise<void> {
    const workspacePathsByProjectId = new Map<string, Set<string>>();
    for (const workspace of workspaceStore.getState().workspaces) {
      if (isFolderWorkspace(workspace)) {
        continue;
      }
      const projectId = workspace.projectId ?? workspace.repoId;
      const worktreePath = workspace.worktreePath?.trim();
      if (!projectId || !worktreePath) {
        continue;
      }
      const workspacePaths = workspacePathsByProjectId.get(projectId) ?? new Set<string>();
      workspacePaths.add(worktreePath);
      workspacePathsByProjectId.set(projectId, workspacePaths);
    }

    await Promise.all(
      projectStore
        .getState()
        .projects.filter((project) => project.sourceType === "git-local")
        .map(async (project) => {
          if (promotionProjectIds.has(project.id)) {
            return;
          }
          const worktreePaths = workspacePathsByProjectId.get(project.id);
          if (!worktreePaths) {
            return;
          }
          const matchingWorktreePath = changedWorktreePaths
            ? Array.from(worktreePaths).find((worktreePath) => changedWorktreePaths.has(worktreePath))
            : Array.from(worktreePaths)[0];
          if (!matchingWorktreePath) {
            return;
          }
          promotionProjectIds.add(project.id);
          try {
            const inspection = await inspectGitRepositoryPath({ path: matchingWorktreePath });
            const remoteUrl = inspection.remoteUrl?.trim();
            if (inspection.isGitRepository && remoteUrl) {
              await promoteGitLocalProject(project.id, remoteUrl);
            }
          } catch (error) {
            console.error("Failed to inspect git-local project for promotion", {
              projectId: project.id,
              worktreePath: matchingWorktreePath,
              error,
            });
          } finally {
            promotionProjectIds.delete(project.id);
          }
        }),
    );
  }

  function onProjectionChanged(versionByWorktreePath: Record<string, number>): void {
    if (versionByWorktreePath === lastVersionByWorktreePath) {
      return;
    }
    const changedWorktreePaths = new Set(
      Object.entries(versionByWorktreePath)
        .filter(([worktreePath, version]) => version > (lastVersionByWorktreePath?.[worktreePath] ?? 0))
        .map(([worktreePath]) => worktreePath),
    );
    lastVersionByWorktreePath = versionByWorktreePath;
    if (changedWorktreePaths.size === 0) {
      return;
    }
    // fire-and-forget: promotion failures are logged and must not block Git projection refreshes.
    void checkGitLocalProjects(changedWorktreePaths);
  }

  return {
    /** Starts the initial origin check and watcher-driven rechecks. */
    start(): () => void {
      // fire-and-forget: promotion failures are logged and must not block runtime startup.
      void checkGitLocalProjects();
      const unsubscribe = gitProjectionStore.subscribe((state) => {
        onProjectionChanged(state.gitRefreshVersionByWorktreePath);
      });
      return unsubscribe;
    },
  };
}

export type GitLocalProjectPromotionRuntime = ReturnType<typeof createGitLocalProjectPromotionRuntime>;
