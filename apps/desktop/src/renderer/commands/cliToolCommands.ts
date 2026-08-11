import { getDaemonClient, invokeDaemonProcedure } from "../rpc/rpcTransport";

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

/**
 * Install/uninstall run in the daemon and can take minutes (npm installs);
 * the default RPC timeout is 30s, so these calls get an explicit long budget.
 */
const CLI_TOOL_INSTALL_RPC_TIMEOUT_MS = 6 * 60_000;

export async function listCLIToolStatuses(forceRefresh = false): Promise<CLIToolStatus[]> {
  const client = await getDaemonClient();
  return await client.cliTools.listStatuses(forceRefresh ? { refresh: true } : undefined);
}

/** Installs one managed CLI tool via the daemon and returns its fresh status. */
export async function installCliTool(toolId: ManagedCliToolId): Promise<CLIToolStatus | undefined> {
  const result = (await invokeDaemonProcedure("cliTools.install", { toolId }, CLI_TOOL_INSTALL_RPC_TIMEOUT_MS)) as {
    status?: CLIToolStatus;
  };
  return result.status;
}

/** Uninstalls one managed CLI tool via the daemon and returns its fresh status. */
export async function uninstallCliTool(toolId: ManagedCliToolId): Promise<CLIToolStatus | undefined> {
  const result = (await invokeDaemonProcedure("cliTools.uninstall", { toolId }, CLI_TOOL_INSTALL_RPC_TIMEOUT_MS)) as {
    status?: CLIToolStatus;
  };
  return result.status;
}
