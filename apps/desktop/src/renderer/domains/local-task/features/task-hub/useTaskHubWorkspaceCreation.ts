import { type WorkspaceProjectRecord, supportsGitFeatures } from "@renderer/domains/project";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createWorkspaceForLocalTask } from "../../commands/localTaskWorkspaceCommands";
import type { LocalTask } from "../../localTaskTypes";

type TaskHubWorkspaceCreation = {
  creatingTaskIds: ReadonlySet<string>;
  unavailableTaskIds: ReadonlySet<string>;
  handleCreateWorkspace: (task: LocalTask) => Promise<void>;
};

/** Provides per-task creation state and availability for Task Hub workspace launches. */
export function useTaskHubWorkspaceCreation(
  tasks: LocalTask[],
  projects: WorkspaceProjectRecord[],
): TaskHubWorkspaceCreation {
  const [creatingTaskIds, setCreatingTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const activeTaskIds = new Set(tasks.filter((task) => task.hasActiveWorkspace).map((task) => task.id));
    setCreatingTaskIds((taskIds) => {
      const pendingTaskIds = new Set([...taskIds].filter((taskId) => !activeTaskIds.has(taskId)));
      return pendingTaskIds.size === taskIds.size ? taskIds : pendingTaskIds;
    });
  }, [tasks]);
  const handleCreateWorkspace = useCallback(async (task: LocalTask) => {
    setCreatingTaskIds((taskIds) => new Set(taskIds).add(task.id));
    try {
      const workspaceId = await createWorkspaceForLocalTask(task);
      if (workspaceId !== undefined) return;
    } catch {
      // The launch was rejected before the daemon accepted it, so permit retry.
    }
    setCreatingTaskIds((taskIds) => {
      const pendingTaskIds = new Set(taskIds);
      pendingTaskIds.delete(task.id);
      return pendingTaskIds;
    });
  }, []);
  const unavailableTaskIds = useMemo(() => {
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    return new Set(
      tasks.flatMap((task) => {
        if (!task.projectId || task.key === null) return task.projectId ? [task.id] : [];
        const project = projectsById.get(task.projectId);
        if (!project) return [task.id];
        const canStartWorkspace =
          supportsGitFeatures(project.sourceType) &&
          Boolean(project.repoKey?.trim() || project.key?.trim()) &&
          Boolean(project.localPath?.trim() || project.path?.trim());
        return canStartWorkspace ? [] : [task.id];
      }),
    );
  }, [projects, tasks]);

  return { creatingTaskIds, unavailableTaskIds, handleCreateWorkspace };
}
