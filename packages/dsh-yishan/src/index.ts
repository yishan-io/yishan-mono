/**
 * Yishan-owned DeepSeek Harness composition plugins.
 *
 * Runtime integration is implemented in focused plugin entry points as each
 * versioned `yishan.*` protocol capability is specified and tested.
 */
export {
  YISHAN_METHODS,
  YISHAN_NOTIFICATIONS,
  YISHAN_PROTOCOL_VERSION,
  YISHAN_REVERSE_METHODS,
  yishanMethod,
} from "./protocol/protocol";
export {
  listProviders,
  validateProviderSelection,
  ProviderSelectionError,
  type ProviderAuthentication,
  type ProviderCatalog,
  type ProviderCatalogEntry,
  type ProviderCatalogModel,
} from "./provider/providers";
export {
  MAX_REQUEST_LIFETIME_MS,
  parseCapabilityRequest,
  type CapabilityRequest,
} from "./protocol/capability";
export { parseDurableCursor, type DurableCursor } from "./shared/cursor";
export {
  isSessionBoundEvent,
  parseSessionBoundData,
  registerSessionEventTypes,
  type SessionBoundData,
} from "./session/binding";
export {
  parseTranscriptResetNotification,
  type SessionCancelRequest,
  type SessionCancelResult,
  type SessionExecutionRequest,
  type SessionFlushRequest,
  type SessionPromptRequest,
  type SessionPromptResult,
  type SessionStartRequest,
  type SessionStartResult,
  type SessionSubscribeRequest,
  type SessionSubscribeResult,
  type SetModelRequest,
  type SequencedSessionEvent,
  type TextPromptContentBlock,
  type TranscriptResetNotification,
} from "./session/protocol";
export {
  parseInteractionRequest,
  type InteractionKind,
  type InteractionRequest,
} from "./protocol/interactionRequest";
export { parseInteractionResponse, type InteractionResponse } from "./protocol/interactionResponse";
export { SessionRuntime, type DurableSessionSnapshot } from "./session/runtime";
export { SessionExecutionError, type SessionExecutionErrorCode } from "./session/errors";
export {
  apply,
  inject,
  name,
  type RuntimeServerConfig,
} from "./rpc-server/plugin";
export { RpcServer } from "./rpc-server/server";
export type {
  SessionDisposeRequest,
  SessionDisposeResult,
  SessionHeaderResult,
  SessionLineageEntry,
  SessionLineageRequest,
  SessionLineageResult,
  SessionListEntry,
  SessionListRequest,
  SessionListResult,
  SessionReadRequest,
  SessionReadResult,
  SessionResumeRequest,
  SessionResumeResult,
} from "./protocol/session";
export {
  SessionError,
  SessionIdMismatchError,
  SessionNotFoundError,
  SessionNotPersistedError,
  SessionWorkspaceMismatchError,
  UnsupportedMethodError,
  RequestPolicyError,
  YISHAN_REQUEST_POLICY_DENIAL_MESSAGE,
  type RequestPolicyErrorCode,
  type SessionErrorCode,
} from "./protocol/errors";

export { RuntimeHost, type RuntimeConfig } from "./runtime/host";
export { isDeveloperMode } from "./runtime/config";
export { YISHAN_AGENT_SPINE_CONFIG, YISHAN_RUNTIME_MCP_ENABLED } from "./runtime/core";

export {
  parsePluginPatch,
  PluginPatchError,
  type PluginPatchConfig,
  type PluginPatchEntry,
  type PluginPatchInject,
  type PluginPatchParseOptions,
} from "./plugin-loader/patch";

export {
  AdaptationManifestError,
  parseAuditedAdaptationManifest,
} from "./plugin-loader/adaptation";

export {
  loadVerifiedPluginLock,
  PluginLockError,
  type PluginLockFile,
  type VerifiedPluginLock,
  type VerifiedPluginPackage,
} from "./plugin-loader/lock";
export {
  mountVerifiedPluginLoader,
  PluginLoaderPolicyError,
  type MountedPluginLoader,
  type PluginLoadState,
} from "./plugin-loader/loader";
