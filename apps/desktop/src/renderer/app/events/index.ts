import { resetAgentLifecycleState } from "../../domains/agent/commands/agentSessionLifecycle";
/**
 * Event composition — starts all feature event handlers with their default
 * deps and returns a combined teardown. This replaces `backendEventStoreBindings.ts`.
 *
 * Phase 2: transport decoding lives in `backendEventAdapter.ts`, event
 * selection in `backendEventRouter.ts` (+ per-family selectors), and each
 * feature handler subscribes to the router in its default deps.
 */
import { startNotificationEventHandlers } from "../../domains/notification/events/notificationEventHandlers";
import { startTerminalEventHandlers } from "../../domains/terminal/events/terminalEventHandlers";
import { startWorkbenchEventHandlers } from "../../domains/workbench/events/workbenchEventHandlers";
import { startWorkspaceEventHandlers } from "../../domains/workspace/events/workspaceEventHandlers";

/**
 * Starts all feature event handlers and returns one teardown function.
 * Mirrors the former `startBackendEventStoreBindings` behavior exactly.
 */
export function startBackendEventHandlers() {
  const stopWorkspaceEventHandlers = startWorkspaceEventHandlers();
  const stopNotificationEventHandlers = startNotificationEventHandlers();
  const stopTerminalEventHandlers = startTerminalEventHandlers();
  const stopWorkbenchEventHandlers = startWorkbenchEventHandlers();

  return () => {
    stopWorkspaceEventHandlers();
    stopNotificationEventHandlers();
    stopTerminalEventHandlers();
    stopWorkbenchEventHandlers();
    resetAgentLifecycleState();
  };
}
