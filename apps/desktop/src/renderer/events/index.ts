/**
 * Root event capability (desktop7 Phase 26).
 *
 * Backend-event delivery (adapter → router → typed subscriptions) and the
 * cross-cutting tab/composer focus-intent bridges. Root-owned so Domains can
 * consume events without importing App (R15) and Workbench can signal focus
 * without importing product Domains (R11). Dependency rules: root `events`
 * may import root `rpc` and `shared` only; it must not import App, Domains,
 * API, or UI.
 */
export { ACTIONS, type AppAction, type AppActionPayload } from "../../shared/contracts/actions";

export {
  BACKEND_EVENT_NAME_BY_SOURCE,
  normalizeBackendEvent,
  type BackendEventName,
  type NormalizedBackendEvent,
} from "./backendEventAdapter";
export {
  createBackendEventPipeline,
  startBackendEventPipeline,
  subscribeAllBackendEvents,
  subscribeBackendEvent,
} from "./backendEventRouter";
export {
  subscribeAppActionEvent,
  subscribeInAppNotificationEvent,
  subscribeWorkspaceChatEvent,
  type AppActionEventPayload,
  type InAppNotificationEventPayload,
  type WorkspaceChatEventPayload,
} from "./backendEventRouter.selectors";
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
