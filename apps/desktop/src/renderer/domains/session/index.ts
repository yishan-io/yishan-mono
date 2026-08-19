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
export { updateLanguagePreference } from "./infrastructure/sessionApi";
export {
  checkAuthStatus,
  getAccessToken,
  logoutFromDaemon,
  persistAuthTokens,
  reloadAuthConfig,
  type CheckAuthStatusOutput,
  type GetAccessTokenOutput,
  type LogoutOutput,
  type PersistAuthTokensInput,
  type ReloadAuthConfigOutput,
} from "./infrastructure/daemonSessionProcedures";
export {
  selectCurrentUser,
  selectCurrentUserNotificationPreferences,
  selectOrganizations,
  selectSelectedOrganizationId,
  selectSessionDaemonId,
} from "./state/sessionSelectors";
export {
  setOrganizationVoiceUsage,
  setSelectedOrganizationId,
  setSessionData,
  updateCurrentUserNotificationPreferences,
} from "./state/sessionStateMutations";
export { sessionStore } from "./state/sessionStore";
export {
  useCurrentUser,
  useDaemonId,
  useOrganizations,
  useSelectedOrganizationId,
  useSessionLoaded,
  useSessionVersions,
} from "./ui/hooks/useSessionReadHooks";

export { useRemoteHealthQuery } from "./hooks/useRemoteHealthQuery";
