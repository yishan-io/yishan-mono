import { NOTIFICATION_PREFERENCES_STORAGE_KEY } from "../../shared/notifications/notificationConstants";
import type {
  NotificationEventType,
  NotificationPreferences,
  NotificationSoundId,
} from "../../shared/notifications/notificationPreferences";
import {
  CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../shared/notifications/notificationPreferences";
import { requestJson } from "../api/restClient";
import { getDesktopHostBridge } from "../rpc/rpcTransport";
import { sessionStore } from "../store/sessionStore";

/** Loads notification preferences from current session user, then falls back to local cache. */
export async function getNotificationPreferences() {
  const currentUserPreferences = sessionStore.getState().currentUser?.notificationPreferences;
  if (currentUserPreferences) {
    const normalized = normalizeNotificationPreferences(currentUserPreferences);
    cacheNotificationPreferences(normalized);
    persistMigratedNotificationPreferences(currentUserPreferences, normalized);
    return normalized;
  }

  const cachedPreferences = getCachedNotificationPreferences();
  cacheNotificationPreferences(cachedPreferences);
  return cachedPreferences;
}

/** Updates notification preferences through api-service and refreshes local cache/session state. */
export async function updateNotificationPreferences(patch: Partial<NotificationPreferences>) {
  const response = await requestJson<{ preferences: NotificationPreferences }>("/notification-preferences", {
    method: "PUT",
    body: patch,
  });
  const normalized = normalizeNotificationPreferences(response.preferences);
  cacheNotificationPreferences(normalized);
  const state = sessionStore.getState();
  if (state.currentUser) {
    state.setSessionData({
      currentUser: {
        ...state.currentUser,
        notificationPreferences: normalized,
      },
      organizations: state.organizations,
      selectedOrganizationId: state.selectedOrganizationId,
    });
  }
  return normalized;
}

/** Triggers one OS notification preview with current or provided preferences. */
export async function previewNotification(input: {
  eventType: NotificationEventType;
}) {
  const previewTitle =
    input.eventType === "pending-question"
      ? "Input required"
      : input.eventType === "run-failed"
        ? "Run needs attention"
        : "Run finished";
  return await getDesktopHostBridge().dispatchNotification({
    title: previewTitle,
    body: "Notification preview",
  });
}

/** Plays one notification sound effect payload through main-process IPC. */
export async function playNotificationSound(input: { soundId: NotificationSoundId; volume: number }) {
  return await getDesktopHostBridge().playNotificationSound(input);
}

/** Dispatches one desktop notification effect payload through main-process IPC. */
export async function dispatchNotification(input: { title: string; body?: string }) {
  return await getDesktopHostBridge().dispatchNotification(input);
}

/** Resolves one storage target for notification preferences when browser storage is available. */
function resolveNotificationPreferencesStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getCachedNotificationPreferences(): NotificationPreferences {
  const storage = resolveNotificationPreferencesStorage();
  if (!storage) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const serialized = storage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
  if (!serialized) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  try {
    const parsed = JSON.parse(serialized);
    return normalizeNotificationPreferences(parsed as Partial<NotificationPreferences>);
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

function cacheNotificationPreferences(preferences: NotificationPreferences): void {
  const storage = resolveNotificationPreferencesStorage();
  storage?.setItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

function normalizeNotificationPreferences(
  input: Partial<NotificationPreferences> | undefined,
): NotificationPreferences {
  const fallback = DEFAULT_NOTIFICATION_PREFERENCES;
  const candidate = input ?? fallback;
  return {
    schemaVersion: CURRENT_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : fallback.enabled,
    osEnabled: typeof candidate.osEnabled === "boolean" ? candidate.osEnabled : fallback.osEnabled,
    soundEnabled: typeof candidate.soundEnabled === "boolean" ? candidate.soundEnabled : fallback.soundEnabled,
    volume:
      typeof candidate.volume === "number" && Number.isFinite(candidate.volume)
        ? Math.max(0, Math.min(1, candidate.volume))
        : fallback.volume,
    focusOnClick: typeof candidate.focusOnClick === "boolean" ? candidate.focusOnClick : fallback.focusOnClick,
    enabledEventTypes:
      Array.isArray(candidate.enabledEventTypes) && candidate.enabledEventTypes.length > 0
        ? [...new Set([...candidate.enabledEventTypes, ...fallback.enabledEventTypes])]
        : [...fallback.enabledEventTypes],
    eventSounds: {
      ...fallback.eventSounds,
      ...(candidate.eventSounds ?? {}),
    },
    enabledCategories:
      Array.isArray(candidate.enabledCategories) && candidate.enabledCategories.length > 0
        ? [...new Set(candidate.enabledCategories)]
        : [...fallback.enabledCategories],
  };
}

function persistMigratedNotificationPreferences(
  originalPreferences: Partial<NotificationPreferences>,
  normalizedPreferences: NotificationPreferences,
): void {
  if (JSON.stringify(originalPreferences) === JSON.stringify(normalizedPreferences)) {
    return;
  }

  void updateNotificationPreferences(normalizedPreferences).catch(() => {
    // Migration persistence is best-effort; callers already use the normalized in-memory snapshot.
  });
}
