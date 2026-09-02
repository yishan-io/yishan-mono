import { projectStore, supportsGitFeatures } from "@renderer/domains/project";
import { sessionStore } from "@renderer/domains/session";
import { createWorkspace } from "@renderer/domains/workspace";
import type { LocalTask } from "../localTaskTypes";

const workspaceLaunchesInFlight = new Map<string, Promise<string | undefined>>();

function toLocalTaskWorkspaceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveLocalTaskWorkspaceNames(taskTitle: string): { name: string; branch: string } {
  const name = toLocalTaskWorkspaceSlug(taskTitle) || "local-task";
  return { name, branch: `task/${name}` };
}

async function launchWorkspaceForLocalTask(task: LocalTask): Promise<string | undefined> {
  const projectId = task.projectId?.trim();
  const project = projectId
    ? projectStore.getState().projects.find((candidate) => candidate.id === projectId)
    : undefined;
  if (!projectId || !project || !supportsGitFeatures(project.sourceType)) return undefined;

  const { name, branch } = deriveLocalTaskWorkspaceNames(task.title);
  const sourceBranch = project.defaultBranch?.trim() || "main";
  const prompt = `Implement this Local Task.\n\nTitle: ${task.title}\n\nDescription:\n${task.description}`;
  return createWorkspace({
    projectId,
    name,
    sourceBranch,
    targetBranch: branch,
    nodeId: sessionStore.getState().daemonId?.trim() || undefined,
    localTaskId: task.id,
    taskRun: { agentKind: "pi", prompt },
  });
}

/** Creates a daemon-linked workspace for a project-owned Local Task, coalescing duplicate launches per task. */
export function createWorkspaceForLocalTask(task: LocalTask): Promise<string | undefined> {
  const existingLaunch = workspaceLaunchesInFlight.get(task.id);
  if (existingLaunch) return existingLaunch;

  const launch = launchWorkspaceForLocalTask(task);
  workspaceLaunchesInFlight.set(task.id, launch);
  launch.then(
    () => workspaceLaunchesInFlight.delete(task.id),
    () => workspaceLaunchesInFlight.delete(task.id),
  );
  return launch;
}
