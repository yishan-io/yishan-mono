import { resolveTabForWorkspace } from "@renderer/domains/workbench";
import { selectSelectedOrganizationId } from "../../../domains/session";
import { selectIsDefaultContextEnabled } from "../../../domains/settings/state/settingsSelectors";
import { buildWorkspaceCreatePlaceholder } from "../../../domains/workspace/model/workspaceCreatePlaceholder";
import { workspaceCreateProgressStore } from "../../../domains/workspace/state/workspaceCreateProgressStore";
import {
  type WorkspaceLifecycleScriptWarning,
  enqueueWorkspaceErrorNotice,
  enqueueWorkspaceLifecycleWarnings,
} from "../../../domains/workspace/state/workspaceLifecycleNoticeStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { normalizeCreateWorkspaceInput } from "../../../helpers/workspaceHelpers";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { selectProjectById } from "../../project/state/projectSelectors";

type CreateWorkspaceInput = {
  projectId: string;
  name: string;
  sourceBranch?: string;
  targetBranch?: string;
  nodeId?: string;
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

/** Creates one workspace by calling backend service when available, then appending it in store state. */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<string | undefined> {
  const store = workspaceStore.getState();
  const { normalizedName } = normalizeCreateWorkspaceInput(input);
  const projectId = input.projectId;

  if (!projectId || !normalizedName) {
    return;
  }

  const project = selectProjectById(projectId);
  const organizationId = selectSelectedOrganizationId()?.trim() || "";

  const repoKey = project?.repoKey?.trim() || project?.key?.trim() || project?.id || "";
  const sourcePath = project?.localPath?.trim() || project?.path?.trim() || "";
  const sourceBranch = input.sourceBranch?.trim() || "";
  const targetBranch = input.targetBranch?.trim() || sourceBranch;
  if (!organizationId || !repoKey || !sourcePath || !sourceBranch || !targetBranch) {
    console.error("Missing required workspace create input", {
      organizationId,
      projectId,
      hasRepoKey: Boolean(repoKey),
      hasSourcePath: Boolean(sourcePath),
      hasSourceBranch: Boolean(sourceBranch),
      hasTargetBranch: Boolean(targetBranch),
    });
    return;
  }

  const normalizedNodeId = input.nodeId?.trim() || "";

  const client = await getDaemonClient();
  let created: Record<string, unknown>;
  try {
    created = (await client.workspace.createWorkspace({
      organizationId,
      nodeId: normalizedNodeId || undefined,
      projectId,
      repoKey,
      workspaceName: normalizedName,
      sourcePath,
      sourceBranch,
      targetBranch,
      contextEnabled: project?.contextEnabled ?? selectIsDefaultContextEnabled(),
      setupHook: project?.setupScript?.trim() || undefined,
      taskRun: input.taskRun,
    })) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace creation failed.";
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

  store.addWorkspace(
    buildWorkspaceCreatePlaceholder({
      repoId: projectId,
      name: normalizedName,
      sourceBranch,
      branch: targetBranch,
      worktreePath: "",
      nodeId: normalizedNodeId || undefined,
      workspaceId,
      organizationId,
      status: "provisioning",
      preserveOnMissingSnapshot: true,
    }),
  );
  workspaceCreateProgressStore.getState().startWorkspaceCreateProgress(workspaceId);
  resolveTabForWorkspace(workspaceId);

  return workspaceId;
}
