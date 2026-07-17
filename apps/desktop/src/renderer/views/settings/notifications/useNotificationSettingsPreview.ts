import type { Commands } from "@renderer/hooks/useCommands";
import { NOTIFICATION_PREVIEW_STATUS_AUTO_HIDE_MS } from "@shared/notifications/notificationConstants";
import type {
  NotificationEventType,
  NotificationPreferences,
  NotificationSoundId,
} from "@shared/notifications/notificationPreferences";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NotificationPreviewStatus,
  NotificationSettingsErrorKey,
  PendingSoundPreviewRequest,
} from "./notificationSettingsState.types";

type UseNotificationSettingsPreviewInput = {
  draft: NotificationPreferences | null;
  playNotificationSound: Commands["playNotificationSound"];
  previewNotification: Commands["previewNotification"];
  previewStatus: NotificationPreviewStatus;
  setErrorKey: (errorKey: NotificationSettingsErrorKey) => void;
  setPreviewStatus: (previewStatus: NotificationPreviewStatus) => void;
};

/**
 * Manages notification and sound preview state for the settings view.
 */
export function useNotificationSettingsPreview({
  draft,
  playNotificationSound,
  previewNotification,
  previewStatus,
  setErrorKey,
  setPreviewStatus,
}: UseNotificationSettingsPreviewInput) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSoundPreviewing, setIsSoundPreviewing] = useState(false);
  const [activeSoundPreview, setActiveSoundPreview] = useState<{
    eventType: NotificationEventType;
    soundId: NotificationSoundId;
  } | null>(null);
  const [previewEventType, setPreviewEventType] = useState<NotificationEventType>("run-finished");
  const isSoundPreviewingRef = useRef(false);
  const pendingSoundPreviewRef = useRef<PendingSoundPreviewRequest | undefined>(undefined);

  useEffect(() => {
    if (!previewStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPreviewStatus(null);
    }, NOTIFICATION_PREVIEW_STATUS_AUTO_HIDE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [previewStatus, setPreviewStatus]);

  const handlePreviewNotification = useCallback(async () => {
    if (!draft || isPreviewing) {
      return;
    }

    setIsPreviewing(true);
    setPreviewStatus(null);
    setErrorKey(null);

    try {
      const result = await previewNotification({
        eventType: previewEventType,
      });
      setPreviewStatus(result.sent ? "sent" : "blocked");
    } catch (error) {
      console.error("Failed to preview notification", error);
      setErrorKey("preview");
    } finally {
      setIsPreviewing(false);
    }
  }, [draft, isPreviewing, previewEventType, previewNotification, setErrorKey, setPreviewStatus]);

  const handlePreviewEventSound = useCallback(
    async (eventType: NotificationEventType, previewSoundId?: NotificationSoundId) => {
      if (!draft) {
        return;
      }

      const soundId = previewSoundId ?? draft.eventSounds[eventType];
      const previewPatch: NotificationPreferences =
        previewSoundId === undefined
          ? draft
          : {
              ...draft,
              eventSounds: {
                ...draft.eventSounds,
                [eventType]: previewSoundId,
              },
            };

      if (isSoundPreviewingRef.current) {
        pendingSoundPreviewRef.current = { eventType, previewPatch, soundId };
        return;
      }

      isSoundPreviewingRef.current = true;
      setIsSoundPreviewing(true);

      let nextPending: PendingSoundPreviewRequest | undefined = { eventType, previewPatch, soundId };

      while (nextPending) {
        setPreviewStatus(null);
        setErrorKey(null);
        setActiveSoundPreview({
          eventType: nextPending.eventType,
          soundId: nextPending.soundId,
        });

        try {
          const result = await playNotificationSound({
            soundId: nextPending.previewPatch.eventSounds[nextPending.eventType],
            volume: nextPending.previewPatch.volume,
          });
          if (!result.played) {
            setErrorKey("previewSound");
          }
        } catch (error) {
          console.error("Failed to preview notification sound", error);
          setErrorKey("previewSound");
        }

        nextPending = pendingSoundPreviewRef.current ?? undefined;
        pendingSoundPreviewRef.current = undefined;
      }

      isSoundPreviewingRef.current = false;
      setActiveSoundPreview(null);
      setIsSoundPreviewing(false);
    },
    [draft, playNotificationSound, setErrorKey, setPreviewStatus],
  );

  return {
    isPreviewing,
    isSoundPreviewing,
    activeSoundPreview,
    previewEventType,
    setPreviewEventType,
    handlePreviewNotification,
    handlePreviewEventSound,
  };
}
