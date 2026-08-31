/** Private daemon-to-DSH bridge wire protocol. */
export {
  YISHAN_METHODS,
  YISHAN_NOTIFICATIONS,
  YISHAN_PROTOCOL_VERSION,
  YISHAN_REVERSE_METHODS,
  yishanMethod,
} from "./protocol/protocol";
export { MAX_REQUEST_LIFETIME_MS, parseCapabilityRequest } from "./protocol/capability";
export { parseInteractionRequest } from "./protocol/request";
export { parseInteractionResponse } from "./protocol/response";

export { workspaceBindingSchema } from "./workspaceBinding";
export type { WorkspaceBinding, WorkspaceBindingRequest, WorkspaceBindingResolver } from "./workspaceBinding";

export { WorkspaceCapabilityClient, createWorkspaceClientResolver } from "./workspace";
export type {
  WorkspaceCapabilityExecution,
  WorkspaceCapabilityIdentity,
  WorkspaceCapabilityIdentityResolver,
  WorkspaceCapabilityRequest,
  WorkspaceCapabilityTransport,
  WorkspaceCapabilityClientResolver,
  WorkspaceCloseInput,
  WorkspaceCloseResult,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
  WorkspaceFindInput,
  WorkspaceFindResult,
  WorkspaceListInput,
  WorkspaceListResult,
  WorkspaceRecord,
} from "./workspace";

export { apply, BridgeHost, name } from "./host";
export type {
  BridgeHostConfig,
  BridgeInitializeHook,
  BridgeNotificationSink,
  BridgeRequestHandler,
  BridgeShutdownHook,
} from "./host";
