import { setTerminalTabAgentKind } from "@renderer/domains/workbench";
/**
 * Terminal event handlers — owns terminal.session.changed (tab reconcile via
 * the reconciler) and terminal.agent.changed (agent-kind metadata).
 *
 * Phase 2 split from `backendEventStoreBindings.ts`. During the transition
 * this factory is consumed by the binding (no self-subscription); at Task 6 its
 * default deps subscribe via the router selectors.
 */
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import { subscribeBackendEvent } from "../../../app/events/backendEventRouter";
import { isDesktopAgentKind } from "../../../helpers/agentSettings";
import { getDaemonClient } from "../../../rpc/rpcTransport";
import { clearTerminalAgentStatus } from "../../agent/commands/agentSessionLifecycle";
import { reconcileTerminalSessionChanged } from "./terminalSessionTabReconciler";

export type TerminalEventDependencies = {
  subscribeTerminalSessionChanged?: (
    listener: (payload: RpcFrontendMessagePayload<"terminalSessionChanged">) => void,
  ) => () => void;
  subscribeTerminalAgentChanged?: (listener: (payload: { tabId: string; agent: string }) => void) => () => void;
  closeTerminalSession?: (sessionId: string) => Promise<void>;
};

export const DEFAULT_TERMINAL_EVENT_DEPENDENCIES: TerminalEventDependencies = {
  subscribeTerminalSessionChanged: (listener) =>
    subscribeBackendEvent("terminal.session.changed", (event) => {
      if (event.source !== "terminalSessionChanged") {
        return;
      }
      listener(event.payload);
    }),
  subscribeTerminalAgentChanged: (listener) =>
    subscribeBackendEvent("terminal.agent.changed", (event) => {
      if (event.source !== "terminalAgentChanged") {
        return;
      }
      listener(event.payload);
    }),
  closeTerminalSession: async (sessionId) => {
    const client = await getDaemonClient();
    await client.terminal.closeSession({ sessionId });
  },
};

/**
 * Starts terminal event handlers with default deps.
 */
export function startTerminalEventHandlers() {
  return createTerminalEventHandlers(DEFAULT_TERMINAL_EVENT_DEPENDENCIES)();
}

/**
 * Creates one terminal event handler factory. Returns `start()` which
 * subscribes to terminal events and returns a teardown.
 */
export function createTerminalEventHandlers(dependencies: TerminalEventDependencies) {
  const resolvedDependencies = {
    ...DEFAULT_TERMINAL_EVENT_DEPENDENCIES,
    ...dependencies,
  } satisfies TerminalEventDependencies;
  return function startTerminalEventHandlers() {
    const unsubscribeTerminalSessionChanged =
      resolvedDependencies.subscribeTerminalSessionChanged?.((payload) => {
        reconcileTerminalSessionChanged(payload, {
          closeTerminalSession: resolvedDependencies.closeTerminalSession,
          clearTerminalAgentStatus,
        });
      }) ?? (() => {});
    const unsubscribeTerminalAgentChanged =
      resolvedDependencies.subscribeTerminalAgentChanged?.((payload) => {
        const tabId = payload.tabId.trim();
        if (!tabId) {
          return;
        }
        const agentKind = isDesktopAgentKind(payload.agent) ? payload.agent : undefined;
        setTerminalTabAgentKind(tabId, agentKind);
      }) ?? (() => {});

    return () => {
      unsubscribeTerminalSessionChanged();
      unsubscribeTerminalAgentChanged();
    };
  };
}
