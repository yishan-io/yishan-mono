/**
 * Session feature public API (Phase 12, desktop5.md).
 *
 * Exports the stable command surface, session models, and the public State
 * surfaces (selectors + actions). The Session Store itself is internal.
 */
export type { SessionCommands } from "./commands/contract";
export type { SessionOrganization, SessionUser } from "./state/sessionStore";
export {
  selectCurrentUserNotificationPreferences,
  selectSelectedOrganizationId,
  selectSessionDaemonId,
} from "./state/sessionSelectors";
export {
  setOrganizationVoiceUsage,
  setSelectedOrganizationId,
  updateCurrentUserNotificationPreferences,
} from "./state/sessionActions";
