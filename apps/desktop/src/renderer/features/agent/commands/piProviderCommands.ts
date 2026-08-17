import { getTabs } from "@renderer/features/workbench";
import { writeTerminalInput } from "../../../features/terminal/commands/terminalCommands";
import type { WorkspaceTab } from "../../../features/workbench";
import { openTab } from "../../../features/workbench/commands/tabCommands";
import { selectSelectedWorkspaceId } from "../../../features/workspace/state/workspaceSelectors";
import { DEFAULT_AGENT_COMMANDS } from "../../../helpers/agentSettings";
import { delay } from "../../../helpers/delay";
import { getDaemonClient } from "../../../rpc/rpcTransport";

/** How long to wait after the Pi TUI boots before typing /login. */
const PI_LOGIN_INPUT_DELAY_MS = 2_000;
/** How long to wait for the opened terminal tab to attach a session. */
const PI_LOGIN_TAB_ATTACH_TIMEOUT_MS = 10_000;

/** Error message used when no workspace is open for Pi sign-in. */
export const NO_ACTIVE_WORKSPACE_LOGIN_ERROR = "no-active-workspace";

export type PiProviderStatus = {
  provider: string;
  type: string;
  /** Credential source label for ambient (environment/cloud) entries. */
  source?: string;
  /** Stored provider-scoped env var NAMES (never values). */
  envVars?: string[];
};

export type PiProviderListResult = {
  providers: PiProviderStatus[];
};

/** Normalizes one unknown RPC payload into ordered provider statuses. */
function normalizePiProviderList(payload: unknown): PiProviderStatus[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const rawProviders = (payload as { providers?: unknown }).providers;
  if (!Array.isArray(rawProviders)) {
    return [];
  }
  const providers: PiProviderStatus[] = [];
  for (const entry of rawProviders) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as { provider?: unknown; type?: unknown; source?: unknown; envVars?: unknown };
    const provider = typeof record.provider === "string" ? record.provider.trim() : "";
    if (!provider) {
      continue;
    }
    const envVars = Array.isArray(record.envVars)
      ? record.envVars.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      : undefined;
    providers.push({
      provider,
      type: typeof record.type === "string" ? record.type : "",
      source: typeof record.source === "string" && record.source.trim().length > 0 ? record.source.trim() : undefined,
      envVars: envVars && envVars.length > 0 ? envVars : undefined,
    });
  }
  return providers;
}

/** Lists providers registered in the yishan pi agent (credential type only). */
export async function listPiProviders(): Promise<PiProviderStatus[]> {
  const client = await getDaemonClient();
  const payload = await client.pi.listProviders();
  return normalizePiProviderList(payload);
}

/** Saves (adds or replaces) one api_key credential for a pi agent provider. */
export async function savePiProvider(provider: string, key: string, env?: Record<string, string>): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.saveProvider({ provider, key, env });
}

/** Removes one provider credential from the yishan pi agent. */
export async function removePiProvider(provider: string): Promise<void> {
  const client = await getDaemonClient();
  await client.pi.removeProvider({ provider });
}

/**
 * Opens a Pi agent terminal tab running the interactive TUI and queues
 * `/login <provider>` so the user can complete subscription/OAuth sign-in.
 * Requires an open workspace (the terminal session is workspace-scoped).
 */
export async function openPiProviderLogin(params: { providerId: string; tabTitle: string }): Promise<void> {
  const workspaceId = selectSelectedWorkspaceId();
  if (!workspaceId) {
    throw new Error(NO_ACTIVE_WORKSPACE_LOGIN_ERROR);
  }

  openTab({
    workspaceId,
    kind: "terminal",
    title: params.tabTitle,
    launchCommand: DEFAULT_AGENT_COMMANDS.pi,
    agentKind: "pi",
    reuseExisting: false,
  });

  const sessionId = await waitForTerminalSessionId(params.tabTitle, PI_LOGIN_TAB_ATTACH_TIMEOUT_MS);
  if (!sessionId) {
    // Degraded path: the tab is open; the user can type /login manually.
    return;
  }

  await delay(PI_LOGIN_INPUT_DELAY_MS);
  await writeTerminalInput({ sessionId, data: `/login ${params.providerId}\r` });
}

/** Polls the tab store until the freshly opened terminal tab attaches a session. */
async function waitForTerminalSessionId(tabTitle: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = getTabs().find(
      (candidate): candidate is Extract<WorkspaceTab, { kind: "terminal" }> =>
        candidate.kind === "terminal" && candidate.data.title === tabTitle,
    );
    if (tab?.data.sessionId) {
      return tab.data.sessionId;
    }
    await delay(100);
  }
  return null;
}
