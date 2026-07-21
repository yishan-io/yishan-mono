import { useCommands } from "@renderer/hooks/useCommands";
import { useState } from "react";
import type { NotificationPreviewStatus, NotificationSettingsErrorKey } from "./notificationSettingsState.types";
import { useNotificationSettingsMutations } from "./useNotificationSettingsMutations";
import { useNotificationSettingsPersistence } from "./useNotificationSettingsPersistence";
import { useNotificationSettingsPreview } from "./useNotificationSettingsPreview";
export type { NotificationPreviewStatus, NotificationSettingsErrorKey } from "./notificationSettingsState.types";

/**
 * Composes notification-settings state, persistence, and preview behavior for the settings panel.
 */
export function useNotificationSettingsState() {
  const { getNotificationPreferences, playNotificationSound, previewNotification, updateNotificationPreferences } =
    useCommands();
  const [errorKey, setErrorKey] = useState<NotificationSettingsErrorKey>(null);
  const [previewStatus, setPreviewStatus] = useState<NotificationPreviewStatus>(null);
  const persistenceState = useNotificationSettingsPersistence({
    getNotificationPreferences,
    updateNotificationPreferences,
    clearPreviewStatus: () => setPreviewStatus(null),
    setErrorKey,
  });
  const previewState = useNotificationSettingsPreview({
    draft: persistenceState.draft,
    playNotificationSound,
    previewNotification,
    previewStatus,
    setErrorKey,
    setPreviewStatus,
  });
  const mutationState = useNotificationSettingsMutations({
    draft: persistenceState.draft,
    isSaving: persistenceState.isSaving,
    persistPreferences: persistenceState.persistPreferences,
    setDraft: persistenceState.setDraft,
  });
  const shouldShowAdvancedSettings = Boolean(persistenceState.draft?.enabled);
  const shouldShowSoundSettings = Boolean(persistenceState.draft?.soundEnabled && shouldShowAdvancedSettings);

  return {
    draft: persistenceState.draft,
    isLoading: persistenceState.isLoading,
    isSaving: persistenceState.isSaving,
    isPreviewing: previewState.isPreviewing,
    isSoundPreviewing: previewState.isSoundPreviewing,
    activeSoundPreview: previewState.activeSoundPreview,
    errorKey,
    previewStatus,
    previewEventType: previewState.previewEventType,
    shouldShowAdvancedSettings,
    shouldShowSoundSettings,
    handlePreviewNotification: previewState.handlePreviewNotification,
    setPreviewEventType: previewState.setPreviewEventType,
    handlePreviewEventSound: previewState.handlePreviewEventSound,
    ...mutationState,
  };
}
