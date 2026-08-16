/**
 * SessionCommands — the public command surface for the Session feature.
 *
 * Phase 7 contract. Owned by `features/session/commands/sessionCommands.ts`;
 * conformance enforces the surface at typecheck time.
 */
import type * as sessionCommands from "./sessionCommands";

export type SessionCommands = {
  getSessionBootstrapData: typeof sessionCommands.getSessionBootstrapData;
  getRemoteHealthStatus: typeof sessionCommands.getRemoteHealthStatus;
  resetAuthExpiredState: typeof sessionCommands.resetAuthExpiredState;
  subscribeAuthExpired: typeof sessionCommands.subscribeAuthExpired;
  isAuthExpiredError: typeof sessionCommands.isAuthExpiredError;
  subscribeDaemonInfoRefresh: typeof sessionCommands.subscribeDaemonInfoRefresh;
  subscribeDaemonConnectionStatus: typeof sessionCommands.subscribeDaemonConnectionStatus;
};
