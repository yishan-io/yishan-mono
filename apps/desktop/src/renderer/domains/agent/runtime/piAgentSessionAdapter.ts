import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { agentChatStore } from "../state/agentChatStore";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "../subscriptions/agentChatEventRouter";
import { handleAgentPiEvent } from "../subscriptions/agentChatPiEventHandler";
import { clearAgentChatSessionStatsSequence, refreshAgentSessionStats } from "../subscriptions/agentChatPiEventShared";

const PI_SESSION_EXISTS_RPC_CODE = -32003;

type PiCompatibilityRequest = { tabId: string; sessionId: string };

/** Registers the Pi event router for a session and returns its cleanup function. */
export function registerPiAgentSessionRouter(tabId: string, sessionId: string): () => void {
  return registerAgentChatEventRouter({ tabId, sessionId, onEvent: (payload) => handleAgentPiEvent(payload) });
}

/** Waits until the Pi event router can receive session events. */
export async function ensurePiAgentSessionRouterReady(): Promise<void> {
  await ensureAgentChatEventRouterReady();
}

/** Requests the Pi model list through the compatibility control channel. */
export async function fetchPiAgentModelsCompatibility(opts: PiCompatibilityRequest): Promise<void> {
  await sendPiControl(opts.sessionId, { type: "get_available_models" });
}

/** Requests the Pi state through the compatibility control channel. */
export async function fetchPiAgentStateCompatibility(opts: PiCompatibilityRequest): Promise<void> {
  await sendPiControl(opts.sessionId, { type: "get_state" });
}

/** Requests the Pi messages through the compatibility control channel. */
export async function fetchPiAgentMessagesCompatibility(opts: PiCompatibilityRequest): Promise<void> {
  await sendPiControl(opts.sessionId, { type: "get_messages" });
}

/** Hydrates a reattached Pi session without changing command-owned initial hydration. */
export async function hydratePiAgentSession(tabId: string, sessionId: string): Promise<void> {
  agentChatStore.getState().setSubagentSessionEndedAt(tabId, null);
  await fetchPiAgentStateCompatibility({ tabId, sessionId });
  await fetchPiAgentMessagesCompatibility({ tabId, sessionId });
  await fetchPiAgentModelsCompatibility({ tabId, sessionId });
  await refreshAgentSessionStats(sessionId);
}

/** Recovers a Pi session after reconnecting, reporting recovery errors in the chat store. */
export async function recoverPiAgentSessionAfterReconnect(opts: {
  tabId: string;
  sessionId: string;
  reattach: () => Promise<void>;
  clearLocalHandle: () => void;
  ensure: () => Promise<void>;
}): Promise<void> {
  try {
    await opts.reattach();
    await hydratePiAgentSession(opts.tabId, opts.sessionId);
  } catch {
    opts.clearLocalHandle();
    try {
      await opts.ensure();
      await hydratePiAgentSession(opts.tabId, opts.sessionId);
    } catch (recoveryError) {
      agentChatStore.getState().setSessionError(opts.tabId, getErrorMessage(recoveryError));
    }
  }
}

/** Returns whether an error reports that an existing Pi session can be attached. */
export function isPiSessionAlreadyRunningError(error: unknown): boolean {
  return (
    (typeof error === "object" && error !== null && "code" in error && error.code === PI_SESSION_EXISTS_RPC_CODE) ||
    getErrorMessage(error).includes("agent session already exists")
  );
}

/** Clears Pi event-stream stats retained for a closed session. */
export function clearPiAgentSessionStats(sessionId: string): void {
  clearAgentChatSessionStatsSequence(sessionId);
}

async function sendPiControl(sessionId: string, command: unknown): Promise<void> {
  const { sendPiCompatibilityCommand } = await import("../daemon/daemonAgentProcedures");
  await sendPiCompatibilityCommand({ sessionId, command });
}
