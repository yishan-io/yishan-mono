import { useCommands } from "@renderer/hooks/useCommands";
import {
  NOTIFICATION_PREFERENCES_LOAD_RETRY_ATTEMPTS,
  NOTIFICATION_PREFERENCES_LOAD_RETRY_BASE_DELAY_MS,
  NOTIFICATION_PREVIEW_STATUS_AUTO_HIDE_MS,
} from "@shared/notifications/notificationConstants";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategory,
  type NotificationEventType,
  type NotificationPreferences,
  type NotificationSoundId,
  SUPPORTED_NOTIFICATION_CATEGORIES,
  SUPPORTED_NOTIFICATION_EVENT_TYPES,
  SUPPORTED_NOTIFICATION_SOUND_IDS,
} from "@shared/notifications/notificationPreferences";
import { useEffect, useRef, useState } from "react";

type PendingSoundPreviewRequest = {
  eventType: NotificationEventType;
  previewPatch: NotificationPreferences;
  soundId: NotificationSoundId;
};

export type NotificationSettingsErrorKey = "load" | "save" | "preview" | "previewSound" | null;
export type NotificationPreviewStatus = "sent" | "blocked" | null;

/**
 * Normalizes one potentially partial preference payload into a safe full snapshot.
 */
function normalizeNotificationPreferencesSnapshot(
  preferences: Partial<NotificationPreferences> | undefined,
  fallback: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
): NotificationPreferences {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  const safePreferences = preferences ?? {};
  const enabledEventTypes = Array.isArray(safePreferences.enabledEventTypes)
    ? safePreferences.enabledEventTypes
        .map((eventType) => (typeof eventType === "string" ? eventType.trim() : ""))
        .filter((eventType): eventType is NotificationEventType =>
          SUPPORTED_NOTIFICATION_EVENT_TYPES.some((supportedType) => supportedType === eventType),
        )
    : fallback.enabledEventTypes;
  const enabledCategories = Array.isArray(safePreferences.enabledCategories)
    ? safePreferences.enabledCategories
        .map((category) => (typeof category === "string" ? category.trim() : ""))
        .filter((category): category is NotificationCategory =>
          SUPPORTED_NOTIFICATION_CATEGORIES.some((supportedCategory) => supportedCategory === category),
        )
    : fallback.enabledCategories;

  const eventSounds = SUPPORTED_NOTIFICATION_EVENT_TYPES.reduce<NotificationPreferences["eventSounds"]>(
    (nextEventSounds, eventType) => {
      const candidateSoundId = safePreferences.eventSounds?.[eventType];
      nextEventSounds[eventType] =
        typeof candidateSoundId === "string" &&
        SUPPORTED_NOTIFICATION_SOUND_IDS.some((supportedSoundId) => supportedSoundId === candidateSoundId)
          ? candidateSoundId
          : fallback.eventSounds[eventType];
      return nextEventSounds;
    },
    { ...fallback.eventSounds },
  );

  return {
    ...defaults,
    ...fallback,
    ...safePreferences,
    enabledEventTypes: [...new Set(enabledEventTypes)],
    enabledCategories: [...new Set(enabledCategories)],
    eventSounds,
  };
}

/**
 * Manages notification-settings state, persistence, and preview side-effects for the settings panel.
 */
export function useNotificationSettingsState() {
  const { getNotificationPreferences, playNotificationSound, previewNotification, updateNotificationPreferences } =
    useCommands();
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSoundPreviewing, setIsSoundPreviewing] = useState(false);
  const [activeSoundPreview, setActiveSoundPreview] = useState<{
    eventType: NotificationEventType;
    soundId: NotificationSoundId;
  } | null>(null);
  const [errorKey, setErrorKey] = useState<NotificationSettingsErrorKey>(null);
  const [previewStatus, setPreviewStatus] = useState<NotificationPreviewStatus>(null);
  const [previewEventType, setPreviewEventType] = useState<NotificationEventType>("run-finished");
  const isSoundPreviewingRef = useRef(false);
  const pendingSoundPreviewRef = useRef<PendingSoundPreviewRequest | undefined>(undefined);
  const shouldShowAdvancedSettings = Boolean(draft?.enabled);
  const shouldShowSoundSettings = Boolean(draft?.soundEnabled && shouldShowAdvancedSettings);

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
  }, [previewStatus]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorKey(null);

    const wait = (durationMs: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
      });

    const loadPreferences = async () => {
      let lastError: unknown = undefined;

      for (let attempt = 1; attempt <= NOTIFICATION_PREFERENCES_LOAD_RETRY_ATTEMPTS; attempt += 1) {
        try {
          const preferences = await getNotificationPreferences();
          if (!cancelled) {
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
      if (!cancelled) {
        setDraft(DEFAULT_NOTIFICATION_PREFERENCES);
        setErrorKey("load");
      }
    };

    const loadAndFinalize = async () => {
      try {
        await loadPreferences();
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadAndFinalize();

    return () => {
      cancelled = true;
    };
  }, [getNotificationPreferences]);

  /**
   * Persists one updated preference snapshot immediately after a setting changes.
   */
  const persistPreferences = async (nextDraft: NotificationPreferences) => {
    if (!draft || isSaving) {
      return;
    }

    const previousDraft = draft;
    setDraft(nextDraft);
    setIsSaving(true);
    setErrorKey(null);
    setPreviewStatus(null);

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
  };

  /**
   * Triggers one live OS notification preview using current draft preferences.
   */
  const handlePreviewNotification = async () => {
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
  };

  /**
   * Triggers one sound-only preview for a selected event using current draft preferences.
   */
  const handlePreviewEventSound = async (eventType: NotificationEventType, previewSoundId?: NotificationSoundId) => {
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
      pendingSoundPreviewRef.current = {
        eventType,
        previewPatch,
        soundId,
      };
      return;
    }

    isSoundPreviewingRef.current = true;
    setIsSoundPreviewing(true);

    let nextPending: PendingSoundPreviewRequest | undefined = {
      eventType,
      previewPatch,
      soundId,
    };

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
  };

  /**
   * Applies one boolean preference change and persists immediately.
   */
  const handleTogglePreference = (key: "enabled" | "osEnabled" | "soundEnabled" | "focusOnClick", value: boolean) => {
    if (!draft || isSaving) {
      return;
    }

    void persistPreferences({
      ...draft,
      [key]: value,
    });
  };

  /**
   * Applies one event-type filter toggle and persists immediately.
   */
  const handleToggleEventType = (eventType: NotificationEventType, checked: boolean) => {
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
  };

  /**
   * Applies one notification-category filter toggle and persists immediately.
   */
  const handleToggleCategory = (category: NotificationCategory, checked: boolean) => {
    if (!draft || isSaving) {
      return;
    }

    const enabledCategories = checked
      ? [...new Set([...draft.enabledCategories, category])]
      : draft.enabledCategories.filter((value) => value !== category);

    void persistPreferences({
      ...draft,
      enabledCategories,
    });
  };

  /**
   * Applies one event sound assignment and persists immediately.
   */
  const handleSelectEventSound = (eventType: NotificationEventType, soundId: NotificationSoundId) => {
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
  };

  /**
   * Updates draft volume locally while the slider is being dragged.
   */
  const handleVolumeChange = (nextValuePercent: number) => {
    if (!draft) {
      return;
    }

    setDraft({
      ...draft,
      volume: nextValuePercent / 100,
    });
  };

  /**
   * Persists the final volume value after user completes one slider interaction.
   */
  const handleVolumeChangeCommitted = (nextValuePercent: number) => {
    if (!draft || isSaving) {
      return;
    }

    void persistPreferences({
      ...draft,
      volume: nextValuePercent / 100,
    });
  };

  return {
    draft,
    isLoading,
    isSaving,
    isPreviewing,
    isSoundPreviewing,
    activeSoundPreview,
    errorKey,
    previewStatus,
    previewEventType,
    shouldShowAdvancedSettings,
    shouldShowSoundSettings,
    handlePreviewNotification,
    setPreviewEventType,
    handlePreviewEventSound,
    handleTogglePreference,
    handleToggleEventType,
    handleToggleCategory,
    handleSelectEventSound,
    handleVolumeChange,
    handleVolumeChangeCommitted,
  };
}
