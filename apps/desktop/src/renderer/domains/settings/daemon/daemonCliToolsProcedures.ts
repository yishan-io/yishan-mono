import { request } from "@renderer/rpc";

/**
 * CLI-tools procedure adapters (desktop7 Phase 26). The settings Domain owns
 * the `cliTools` namespace over the root transport's path-based invoke.
 * Install/uninstall run in the daemon and can take minutes (npm installs);
 * the default RPC timeout is 30s, so these calls get an explicit long budget.
 */

export type DaemonCliToolStatus = {
  toolId: string;
  category: string;
  label: string;
  installed: boolean;
  version?: string;
  authenticated?: boolean;
  account?: string;
  statusDetail: string;
  supportsToggle?: boolean;
  resolvedPath?: string;
  managedInstall?: boolean;
  latestVersion?: string;
};

const CLI_TOOL_INSTALL_RPC_TIMEOUT_MS = 6 * 60_000;

export async function listDaemonCliTools(input?: { refresh?: boolean }): Promise<DaemonCliToolStatus[]> {
  return (await request("cliTools.listStatuses", input ?? {})) as DaemonCliToolStatus[];
}

export async function installDaemonCliTool(input: { toolId: string }): Promise<{ status?: DaemonCliToolStatus }> {
  return (await request("cliTools.install", input, CLI_TOOL_INSTALL_RPC_TIMEOUT_MS)) as {
    status?: DaemonCliToolStatus;
  };
}

export async function uninstallDaemonCliTool(input: { toolId: string }): Promise<{ status?: DaemonCliToolStatus }> {
  return (await request("cliTools.uninstall", input, CLI_TOOL_INSTALL_RPC_TIMEOUT_MS)) as {
    status?: DaemonCliToolStatus;
  };
}
