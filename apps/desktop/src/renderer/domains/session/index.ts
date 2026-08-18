/**
 * Session Domain public API (Domains plan D3).
 *
 * Exports the stable command surface, session model types, the public State
 * surfaces (selectors + actions), the read Store, and the read-only React
 * hooks. Cross-Domain code imports session through this file only.
 */
export type { SessionOrganization, SessionUser } from "./model/sessionTypes";
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
} from "./state/sessionActions";
export { sessionStore } from "./state/sessionStore";
export {
  useCurrentUser,
  useDaemonId,
  useOrganizations,
  useSelectedOrganizationId,
  useSessionLoaded,
  useSessionVersions,
} from "./ui/hooks/useSessionReadHooks";
