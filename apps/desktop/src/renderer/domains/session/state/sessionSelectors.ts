import type { SessionUser } from "./sessionStore";
import { sessionStore } from "./sessionStore";

/**
 * Session feature selectors — the public read surface for session State
 * (Phase 12, desktop5.md). Cross-feature code reads session state through
 * these functions instead of importing the session Store directly.
 */
export function selectSelectedOrganizationId(): string | undefined {
  return sessionStore.getState().selectedOrganizationId;
}

export function selectOrganizations() {
  return sessionStore.getState().organizations;
}

export function selectCurrentUser() {
  return sessionStore.getState().currentUser;
}

export function selectSessionDaemonId(): string | undefined {
  return sessionStore.getState().daemonId;
}

export function selectCurrentUserNotificationPreferences(): SessionUser["notificationPreferences"] | undefined {
  return sessionStore.getState().currentUser?.notificationPreferences;
}
