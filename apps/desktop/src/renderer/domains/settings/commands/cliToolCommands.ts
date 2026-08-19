import {
  installDaemonCliTool,
  listDaemonCliTools,
  uninstallDaemonCliTool,
} from "../daemon/daemonCliToolsProcedures";

export type CLIToolStatus = {
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

/** The managed CLI tools the daemon can install/uninstall. */
export const MANAGED_CLI_TOOL_IDS = {
  yishan: "yishan",
  pi: "pi",
} as const;

export type ManagedCliToolId = (typeof MANAGED_CLI_TOOL_IDS)[keyof typeof MANAGED_CLI_TOOL_IDS];

export async function listCLIToolStatuses(forceRefresh = false): Promise<CLIToolStatus[]> {
  return await listDaemonCliTools(forceRefresh ? { refresh: true } : undefined);
}

/** Installs one managed CLI tool via the daemon and returns its fresh status. */
export async function installCliTool(toolId: ManagedCliToolId): Promise<CLIToolStatus | undefined> {
  const result = await installDaemonCliTool({ toolId });
  return result.status;
}

/** Uninstalls one managed CLI tool via the daemon and returns its fresh status. */
export async function uninstallCliTool(toolId: ManagedCliToolId): Promise<CLIToolStatus | undefined> {
  const result = await uninstallDaemonCliTool({ toolId });
  return result.status;
}
