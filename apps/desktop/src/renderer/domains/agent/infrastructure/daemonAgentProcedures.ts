import type {
  PiActiveSessionSummary,
  PiGetSessionFileInput,
  PiGetSessionFileResult,
  PiListActiveSessionsInput,
  PiListSessionsInput,
  PiSessionSummary,
} from "../../../rpc/daemonTypes";
import { invokeDaemonProcedure } from "../../../rpc/rpcTransport";

/**
 * Agent procedure adapters (desktop7 Phase 25). The agent Domain owns its
 * chat / pi / agent namespace procedures over the root transport's
 * path-based invoke. Wire DTOs stay in root `daemonTypes` (transport
 * contract); these wrappers are the only agent code that touches transport.
 */

// ─── chat ────────────────────────────────────────────────────────────────────

export async function ensureWorkspaceChatSession(input: {
  workspaceId: string;
  sessionId?: string;
  title?: string;
  agentKind?: string;
}): Promise<unknown> {
  return invokeDaemonProcedure("chat.ensureWorkspaceChatSession", input);
}

export async function runWorkspaceChatPrompt(input: {
  workspaceId: string;
  sessionId: string;
  prompt: string;
  agentKind?: string;
  suppressCompletionNotification?: boolean;
}): Promise<unknown> {
  return invokeDaemonProcedure("chat.runWorkspaceChatPrompt", input);
}

export async function closeAgentSession(input: { sessionId: string; deleteRecord?: boolean }): Promise<unknown> {
  return invokeDaemonProcedure("chat.closeAgentSession", input);
}

// ─── pi ──────────────────────────────────────────────────────────────────────

export async function startPiSession(input: {
  sessionId: string;
  tabId: string;
  paneId?: string;
  workspaceId: string;
  cwd: string;
  resume?: boolean;
}): Promise<{ sessionId: string }> {
  return (await invokeDaemonProcedure("pi.start", input)) as { sessionId: string };
}

export async function attachPiSession(input: {
  sessionId: string;
  tabId?: string;
  workspaceId?: string;
  cwd?: string;
}): Promise<{ ok: boolean }> {
  return (await invokeDaemonProcedure("pi.attach", input)) as { ok: boolean };
}

export async function stopPiSession(input: { sessionId: string }): Promise<{ ok: boolean }> {
  return (await invokeDaemonProcedure("pi.stop", input)) as { ok: boolean };
}

export async function sendPiCommand(input: { sessionId: string; command: unknown }): Promise<unknown> {
  return invokeDaemonProcedure("pi.send", input);
}

export async function renamePiSession(input: { sessionId: string; title: string }): Promise<{ ok: boolean }> {
  return (await invokeDaemonProcedure("pi.rename", input)) as { ok: boolean };
}

export async function listPiSessions(input?: PiListSessionsInput): Promise<PiSessionSummary[]> {
  return (await invokeDaemonProcedure("pi.listSessions", input ?? {})) as PiSessionSummary[];
}

export async function getPiSessionFile(input: PiGetSessionFileInput): Promise<PiGetSessionFileResult> {
  return (await invokeDaemonProcedure("pi.getSessionFile", input)) as PiGetSessionFileResult;
}

export async function listActivePiSessions(input?: PiListActiveSessionsInput): Promise<PiActiveSessionSummary[]> {
  return (await invokeDaemonProcedure("pi.listActiveSessions", input ?? {})) as PiActiveSessionSummary[];
}

export async function listPiProviders(input?: unknown): Promise<{
  providers: Array<{ provider: string; type: string; source?: string; envVars?: string[] }>;
}> {
  return (await invokeDaemonProcedure("pi.listProviders", input ?? {})) as {
    providers: Array<{ provider: string; type: string; source?: string; envVars?: string[] }>;
  };
}

export async function savePiProvider(input: {
  provider: string;
  key: string;
  env?: Record<string, string>;
}): Promise<{ ok: boolean }> {
  return (await invokeDaemonProcedure("pi.saveProvider", input)) as { ok: boolean };
}

export async function removePiProvider(input: { provider: string }): Promise<{ ok: boolean }> {
  return (await invokeDaemonProcedure("pi.removeProvider", input)) as { ok: boolean };
}

// ─── agent ───────────────────────────────────────────────────────────────────

export async function listAgentDetectionStatuses(input?: unknown): Promise<unknown> {
  return invokeDaemonProcedure("agent.listDetectionStatuses", input ?? {});
}

export async function listAgentModels(input?: { agentKind?: string; forceRefresh?: boolean }): Promise<{
  agentKind: string;
  models: Array<{ id: string; name: string }>;
  source: string;
  fetchedAt: number;
  cacheExpiry: number;
}> {
  return (await invokeDaemonProcedure("agent.listModels", input ?? {})) as {
    agentKind: string;
    models: Array<{ id: string; name: string }>;
    source: string;
    fetchedAt: number;
    cacheExpiry: number;
  };
}
