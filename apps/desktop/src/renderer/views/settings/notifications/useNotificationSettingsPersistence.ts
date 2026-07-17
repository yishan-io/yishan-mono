import type { Commands } from "@renderer/hooks/useCommands";
import {
  NOTIFICATION_PREFERENCES_LOAD_RETRY_ATTEMPTS,
  NOTIFICATION_PREFERENCES_LOAD_RETRY_BASE_DELAY_MS,
} from "@shared/notifications/notificationConstants";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@shared/notifications/notificationPreferences";
import { useCallback, useEffect, useState } from "react";
import { normalizeNotificationPreferencesSnapshot } from "./notificationSettingsPreferences";
import type { NotificationSettingsErrorKey } from "./notificationSettingsState.types";

type UseNotificationSettingsPersistenceInput = {
  getNotificationPreferences: Commands["getNotificationPreferences"];
  updateNotificationPreferences: Commands["updateNotificationPreferences"];
  clearPreviewStatus: () => void;
  setErrorKey: (errorKey: NotificationSettingsErrorKey) => void;
};

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });

/**
 * Loads and persists notification preference snapshots for the settings view.
 */
export function useNotificationSettingsPersistence({
  getNotificationPreferences,
  updateNotificationPreferences,
  clearPreviewStatus,
  setErrorKey,
}: UseNotificationSettingsPersistenceInput) {
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadPreferences = async () => {
      setIsLoading(true);
      setErrorKey(null);

      let lastError: unknown = undefined;

      try {
        for (let attempt = 1; attempt <= NOTIFICATION_PREFERENCES_LOAD_RETRY_ATTEMPTS; attempt += 1) {
          try {
            const preferences = await getNotificationPreferences();
            if (!isCancelled) {
              setDraft(normalizeNotificationPreferencesSnapshot(preferences));
              setErrorKey(null);
            }
            return;
          } catch (error) {
            lastError = error;
            if (attempt < NOTIFICATION_PREFERENCES_LOAD_RETRY_ATTEMPTS) {
              await wait(NOTIFICATION_PREFERENCES_LOAD_RETRY_BASE_DELAY_MS * attempt);
            }
          }
        }

        console.error("Failed to load notification preferences", lastError);
        if (!isCancelled) {
          setDraft(DEFAULT_NOTIFICATION_PREFERENCES);
          setErrorKey("load");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPreferences();

    return () => {
      isCancelled = true;
    };
  }, [getNotificationPreferences, setErrorKey]);

  const persistPreferences = useCallback(
    async (nextDraft: NotificationPreferences) => {
      if (!draft || isSaving) {
        return;
      }

      const previousDraft = draft;
      setDraft(nextDraft);
      setIsSaving(true);
      setErrorKey(null);
      clearPreviewStatus();

      try {
        const persistedPreferences = await updateNotificationPreferences(nextDraft);
        setDraft(normalizeNotificationPreferencesSnapshot(persistedPreferences, nextDraft));
      } catch (error) {
        console.error("Failed to update notification preferences", error);
        setDraft(previousDraft);
        setErrorKey("save");
      } finally {
        setIsSaving(false);
      }
    },
    [clearPreviewStatus, draft, isSaving, setErrorKey, updateNotificationPreferences],
  );

  return {
    draft,
    setDraft,
    isLoading,
    isSaving,
    persistPreferences,
  };
}
