/**
 * Session Domain public API (Domains plan D3).
 *
 * Exports the stable command surface, session model types, the public State
 * surfaces (selectors + actions), the read Store, and the read-only React
 * hooks. Cross-Domain code imports session through this file only.
 */
export type { SessionOrganization, SessionUser } from "./sessionTypes";
export {
  getRemoteHealthStatus,
  getSessionBootstrapData,
  isAuthExpiredError,
  resetAuthExpiredState,
  subscribeAuthExpired,
  subscribeDaemonConnectionStatus,
  subscribeDaemonInfoRefresh,
  subscribeDaemonInfoRefreshed,
} from "./commands/sessionCommands";
export { updateLanguagePreference } from "./api/sessionApi";
export {
  checkAuthStatus,
  getAccessToken,
  logoutFromDaemon,
  reloadAuthConfig,
  type CheckAuthStatusOutput,
  type GetAccessTokenOutput,
  type LogoutOutput,
  type PersistAuthTokensInput,
  type ReloadAuthConfigOutput,
} from "./daemon/daemonSessionProcedures";
export { sessionStore } from "./state/sessionStore";
