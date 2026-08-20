/**
 * Root event capability (desktop8 Phase 32: local implementation only).
 *
 * Owns the desktop-RPC event bus (bridge + backend frontend stream) and the
 * backend-event pipeline implementation (adapter / router / selectors). App
 * event composition lives in `app/events` and imports this capability;
 * Domains consume events through this facade (R15-safe). Dependency rules:
 * root `events` may import root `rpc`, `platform`, and `shared` only; it
 * must not import App, Domains, API, or UI.
 */
export {
  emitDesktopRpcEventToBus,
  subscribeDesktopRpcEvent,
  type DesktopEventEnvelope,
} from "./desktopRpcEventBus";
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
export { ACTIONS, type AppAction, type AppActionPayload } from "../../shared/contracts/actions";
export type { RpcFrontendMessagePayload } from "../../shared/contracts/rpcSchema";
