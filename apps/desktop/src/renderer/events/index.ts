export {
  emitDesktopRpcEventToBus,
  subscribeDesktopRpcEvent,
  type DesktopRpcEventEnvelope,
} from "./desktopRpcEventBus";
/**
 * Root event capability (desktop7 Phase 26/27).
 *
 * Cross-cutting tab/composer focus-intent bridges plus the backend-event
 * delivery facade. The transport-facing pipeline implementation lives in
 * `app/events` (whitelisted to import root RPC); this module re-exports it so
 * Domains consume events without importing App (R15) and Workbench signals
 * focus without importing product Domains (R11). Dependency rules: root
 * `events` may import App events, root `rpc`, and `shared` only; it must not
 * import Domains, API, or UI.
 */
export {
  BACKEND_EVENT_NAME_BY_SOURCE,
  normalizeBackendEvent,
  type BackendEventName,
  type NormalizedBackendEvent,
} from "../app/events/backendEventAdapter";
export {
  createBackendEventPipeline,
  startBackendEventPipeline,
  subscribeAllBackendEvents,
  subscribeBackendEvent,
} from "../app/events/backendEventRouter";
export {
  subscribeAppActionEvent,
  subscribeInAppNotificationEvent,
  subscribeWorkspaceChatEvent,
  type AppActionEventPayload,
  type InAppNotificationEventPayload,
  type WorkspaceChatEventPayload,
} from "../app/events/backendEventRouter.selectors";
export { ACTIONS, type AppAction, type AppActionPayload } from "../../shared/contracts/actions";
export type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
export {
  AGENT_CHAT_COMPOSER_FOCUS_EVENT,
  clearAgentChatComposerFocus,
  consumeAgentChatComposerFocus,
  getAgentChatComposerFocusRequest,
  requestAgentChatComposerFocus,
  requestNewAgentChatComposerFocus,
  retainOpenAgentChatComposerFocus,
} from "./agentChatComposerFocus";
export {
  TERMINAL_TAB_FOCUS_EVENT,
  consumeTerminalTabFocus,
  hasPendingTerminalTabFocus,
  requestTerminalTabFocus,
  retainOpenTerminalTabFocus,
} from "./terminalTabFocus";
