import type {
  NotificationEventType,
  NotificationPreferences,
  NotificationSoundId,
} from "@shared/notifications/notificationPreferences";
import { useCallback } from "react";

type UseNotificationSettingsMutationsInput = {
  draft: NotificationPreferences | null;
  isSaving: boolean;
  persistPreferences: (nextDraft: NotificationPreferences) => Promise<void>;
  setDraft: (nextDraft: NotificationPreferences) => void;
};

/**
 * Builds per-setting mutation handlers for the notification settings view.
 */
export function useNotificationSettingsMutations({
  draft,
  isSaving,
  persistPreferences,
  setDraft,
}: UseNotificationSettingsMutationsInput) {
  const handleTogglePreference = useCallback(
    (key: "enabled" | "osEnabled" | "soundEnabled" | "focusOnClick", value: boolean) => {
      if (!draft || isSaving) {
        return;
      }

      void persistPreferences({
        ...draft,
        [key]: value,
      });
    },
    [draft, isSaving, persistPreferences],
  );

  const handleToggleEventType = useCallback(
    (eventType: NotificationEventType, checked: boolean) => {
      if (!draft || isSaving) {
        return;
      }

      const enabledEventTypes = checked
        ? [...new Set([...draft.enabledEventTypes, eventType])]
        : draft.enabledEventTypes.filter((value) => value !== eventType);

      void persistPreferences({
        ...draft,
        enabledEventTypes,
      });
    },
    [draft, isSaving, persistPreferences],
  );

  const handleSelectEventSound = useCallback(
    (eventType: NotificationEventType, soundId: NotificationSoundId) => {
      if (!draft || isSaving) {
        return;
      }

      void persistPreferences({
        ...draft,
        eventSounds: {
          ...draft.eventSounds,
          [eventType]: soundId,
        },
      });
    },
    [draft, isSaving, persistPreferences],
  );

  const handleVolumeChange = useCallback(
    (nextValuePercent: number) => {
      if (!draft) {
        return;
      }

      setDraft({
        ...draft,
        volume: nextValuePercent / 100,
      });
    },
    [draft, setDraft],
  );

  const handleVolumeChangeCommitted = useCallback(
    (nextValuePercent: number) => {
      if (!draft || isSaving) {
        return;
      }

      void persistPreferences({
        ...draft,
        volume: nextValuePercent / 100,
      });
    },
    [draft, isSaving, persistPreferences],
  );

  return {
    handleTogglePreference,
    handleToggleEventType,
    handleSelectEventSound,
    handleVolumeChange,
    handleVolumeChangeCommitted,
  };
}
