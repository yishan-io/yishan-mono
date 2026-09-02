import { projectStore } from "@renderer/domains/project";
import { getErrorMessage } from "@shared/errors/getErrorMessage";

import { sessionStore } from "@renderer/domains/session";
import { workspaceCreateProgressStore } from "../../../domains/workspace/state/workspaceCreateProgressStore";
import {
  type WorkspaceLifecycleScriptWarning,
  enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings,
} from "../../../domains/workspace/state/workspaceLifecycleNoticeStore";
import { getWorkspaceRpc } from "../daemon/daemonWorkspaceClient";
import { workspaceSettingsStore } from "../state/workspaceSettingsStore";
import { normalizeCreateWorkspaceInput } from "../state/workspaceStoreMutations";

type CreateWorkspaceInput = {
  projectId: string;
  name: string;
  sourceBranch?: string;
  targetBranch?: string;
  nodeId?: string;
  localTaskId?: string;
  taskRun?: {
    agentKind: string;
    prompt: string;
    model?: string;
  };
};

type CreateWorkspaceResponse = {
  workspaceId: string;
  projectId?: string;
  name: string;
  sourceBranch: string;
  branch: string;
  worktreePath: string;
  status: string;
  lifecycleScriptWarnings: WorkspaceLifecycleScriptWarning[];
};

/**
 * Normalizes a raw lifecycle script warning from the daemon into the expected
 * shape. Handles both properly structured objects and legacy plain-string
 * warnings gracefully.
 */
function normalizeLifecycleWarning(
  raw: unknown,
  fallbackKind: "setup" | "post",
  fallbackCommand: string,
): WorkspaceLifecycleScriptWarning {
  if (typeof raw === "string") {
    return {
      scriptKind: fallbackKind,
      timedOut: false,
      message: raw,
      command: fallbackCommand,
      stdoutExcerpt: "",
      stderrExcerpt: "",
      exitCode: null,
      signal: null,
      logFilePath: null,
    };
  }

  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    scriptKind: record.scriptKind === "setup" || record.scriptKind === "post" ? record.scriptKind : fallbackKind,
    timedOut: Boolean(record.timedOut),
    message: typeof record.message === "string" ? record.message : "",
    command: typeof record.command === "string" && record.command ? record.command : fallbackCommand,
    stdoutExcerpt: typeof record.stdoutExcerpt === "string" ? record.stdoutExcerpt : "",
    stderrExcerpt: typeof record.stderrExcerpt === "string" ? record.stderrExcerpt : "",
    exitCode: typeof record.exitCode === "number" ? record.exitCode : null,
    signal: typeof record.signal === "string" ? record.signal : null,
    logFilePath: typeof record.logFilePath === "string" ? record.logFilePath : null,
  };
}

/**
 * Enqueues in-app lifecycle script warning notices for one workspace.
 */
export function notifyLifecycleScriptWarnings(
  workspaceName: string,
  warnings: WorkspaceLifecycleScriptWarning[] | undefined,
  fallbackKind: "setup" | "post",
  fallbackCommand: string,
): void {
  if (!warnings || warnings.length === 0) {
    return;
  }

  enqueueWorkspaceLifecycleWarnings({
    workspaceName,
    warnings: warnings.map((w) => normalizeLifecycleWarning(w, fallbackKind, fallbackCommand)),
  });
}

function isReauthRequiredRemoteSyncWarning(message: string): boolean {
  return /authenticated api session|refresh token|unauthorized|yishan login/i.test(message);
}

/** Creates one workspace through the daemon and starts progress tracking after acceptance. */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<string | undefined> {
  const { normalizedName } = normalizeCreateWorkspaceInput(input);
  const projectId = input.projectId;

  if (!projectId || !normalizedName) {
    return;
  }

  const project = projectStore.getState().projects.find((item) => item.id === projectId);
  const organizationId = sessionStore.getState().selectedOrganizationId?.trim() || "";

  const repoKey = project?.repoKey?.trim() || project?.key?.trim() || "";
  const sourcePath = project?.localPath?.trim() || project?.path?.trim() || "";
  const sourceBranch = input.sourceBranch?.trim() || "";
  const targetBranch = input.targetBranch?.trim() || sourceBranch;
  const missingPrerequisiteMessage = !organizationId
    ? "Select an organization before creating a workspace."
    : !repoKey
      ? "The selected project is missing its repository key."
      : !sourcePath
        ? "The selected project is missing its local path."
        : !sourceBranch
          ? "Select a source branch before creating a workspace."
          : !targetBranch
            ? "Enter a target branch before creating a workspace."
            : undefined;
  if (missingPrerequisiteMessage) {
    enqueueWorkspaceErrorNotice({ title: "Failed to create workspace", message: missingPrerequisiteMessage });
    return;
  }

  const normalizedNodeId = input.nodeId?.trim() || "";

  const workspaceRpc = await getWorkspaceRpc();
  let created: Record<string, unknown>;
  try {
    created = (await workspaceRpc.createWorkspace({
      organizationId,
      nodeId: normalizedNodeId || undefined,
      localTaskId: input.localTaskId?.trim() || undefined,
      projectId,
      repoKey,
      workspaceName: normalizedName,
      sourcePath,
      sourceBranch,
      targetBranch,
      contextEnabled: project?.contextEnabled ?? workspaceSettingsStore.getState().isDefaultContextEnabled,
      setupHook: project?.setupScript?.trim() || undefined,
      taskRun: input.taskRun,
    })) as Record<string, unknown>;
  } catch (error) {
    const message = getErrorMessage(error) || "Workspace creation failed.";
    const daemonPrefixMatch = message.match(/^daemon RPC error -?\d+:\s*(.*)$/s);
    enqueueWorkspaceErrorNotice({
      title: "Failed to create workspace",
      message: daemonPrefixMatch?.[1]?.trim() || message,
    });
    return;
  }

  const workspaceId =
    (typeof created.id === "string" ? created.id : "") ||
    (typeof created.workspaceId === "string" ? created.workspaceId : "");
  if (!workspaceId) {
    enqueueWorkspaceErrorNotice({
      title: "Failed to create workspace",
      message: "Daemon did not return a workspace ID",
    });
    return;
  }

  workspaceCreateProgressStore.getState().startWorkspaceCreateProgress(workspaceId);

  return workspaceId;
}
