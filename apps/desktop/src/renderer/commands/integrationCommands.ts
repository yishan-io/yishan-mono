import { getDaemonClient } from "../rpc/rpcTransport";

export type GitHubConnectionStatus = {
  installed: boolean;
  loggedIn: boolean;
  username?: string;
  statusDetail: string;
};

/** Checks the GitHub CLI connection status via the daemon. */
export async function checkGitHubConnectionStatus(forceRefresh = false): Promise<GitHubConnectionStatus> {
  const client = await getDaemonClient();
  const payload = await client.integration.githubStatus(forceRefresh ? { refresh: true } : undefined);
  return {
    installed: Boolean(payload.installed),
    loggedIn: Boolean(payload.loggedIn),
    username: typeof payload.username === "string" ? payload.username.trim() || undefined : undefined,
    statusDetail: typeof payload.statusDetail === "string" ? payload.statusDetail : "Unknown status",
  };
}
