import { Alert, Box, Button, CircularProgress, MenuItem, Stack, Typography } from "@mui/material";
import { CenteredSpinner } from "@renderer/components/CenteredSpinner";
import {
  SettingsCard,
  SettingsCheckboxRow,
  SettingsCompactSelect,
  SettingsRows,
  SettingsSectionHeader,
  SettingsSoundSelectRow,
  SettingsToggleRow,
  SettingsVolumeRow,
} from "@renderer/components/settings";
import {
  type NotificationCategory,
  type NotificationEventType,
  type NotificationSoundId,
  SUPPORTED_NOTIFICATION_CATEGORIES,
  SUPPORTED_NOTIFICATION_SOUND_IDS,
} from "@shared/notifications/notificationPreferences";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiCheckCircle, BiLoaderAlt, BiXCircle } from "react-icons/bi";
import {
  type NotificationSettingsFocusItemId,
  getNotificationSettingsAnchorId,
  isNotificationSettingsFocusItemId,
} from "./notificationSettingsCatalog";
import { useNotificationSettingsState } from "./useNotificationSettingsState";

const NOTIFICATION_EVENT_OPTIONS: Array<{ type: NotificationEventType; labelKey: string }> = [
  {
    type: "run-finished",
    labelKey: "org.settings.notifications.events.runFinished",
  },
  {
    type: "run-failed",
    labelKey: "org.settings.notifications.events.runFailed",
  },
  {
    type: "pending-question",
    labelKey: "org.settings.notifications.events.pendingQuestion",
  },
];

const NOTIFICATION_SOUND_OPTIONS: Array<{ soundId: NotificationSoundId; labelKey: string }> =
  SUPPORTED_NOTIFICATION_SOUND_IDS.map((soundId) => ({
    soundId,
    labelKey: `org.settings.notifications.sounds.${soundId}`,
  }));

const NOTIFICATION_RUN_TYPE_OPTIONS: Array<{ category: NotificationCategory; labelKey: string }> =
  SUPPORTED_NOTIFICATION_CATEGORIES.map((category) => ({
    category,
    labelKey: `org.settings.notifications.runTypes.items.${category}`,
  }));

type NotificationPreviewIndicatorState = "inProgress" | "success" | "failed" | null;
type NotificationSettingsViewProps = {
  focusItemId?: NotificationSettingsFocusItemId | null;
};
type FocusableSettingsRowProps = {
  itemId: NotificationSettingsFocusItemId;
  focusedItemId: NotificationSettingsFocusItemId | null;
  children: ReactNode;
};

const EVENT_SOUND_FOCUS_IDS: Record<NotificationEventType, NotificationSettingsFocusItemId> = {
  "run-finished": "sound-run-finished",
  "run-failed": "sound-run-failed",
  "pending-question": "sound-pending-question",
};

const RUN_TYPE_FOCUS_IDS: Record<NotificationCategory, NotificationSettingsFocusItemId> = {
  "ai-task": "run-type-ai-task",
};

const EVENT_FILTER_FOCUS_IDS: Record<NotificationEventType, NotificationSettingsFocusItemId> = {
  "run-finished": "event-run-finished",
  "run-failed": "event-run-failed",
  "pending-question": "event-pending-question",
};

/**
 * Wraps one settings row with a stable anchor and temporary highlight when focused from search.
 */
function FocusableSettingsRow({ itemId, focusedItemId, children }: FocusableSettingsRowProps) {
  const isFocused = focusedItemId === itemId;
  return (
    <Box
      id={getNotificationSettingsAnchorId(itemId)}
      sx={{
        borderRadius: 1,
        scrollMarginTop: 24,
        backgroundColor: isFocused ? "action.hover" : "transparent",
        transition: "background-color 220ms ease",
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Resolves whether one focused setting row is currently rendered under the active notification toggle state.
 */
function isFocusableSettingsItemVisible(input: {
  focusItemId: NotificationSettingsFocusItemId;
  isAdvancedSettingsVisible: boolean;
  isSoundSettingsVisible: boolean;
}): boolean {
  if (input.focusItemId === "enabled") {
    return true;
  }
  if (input.focusItemId === "os-enabled") {
    return input.isAdvancedSettingsVisible;
  }
  if (!input.isAdvancedSettingsVisible) {
    return false;
  }
  if (
    input.focusItemId === "volume" ||
    input.focusItemId === "sound-run-finished" ||
    input.focusItemId === "sound-run-failed" ||
    input.focusItemId === "sound-pending-question"
  ) {
    return input.isSoundSettingsVisible;
  }
  return true;
}

/**
 * Renders the notification settings form in the settings content area.
 */
export function NotificationSettingsView({ focusItemId }: NotificationSettingsViewProps) {
  const { t } = useTranslation();
  const [highlightedFocusItemId, setHighlightedFocusItemId] = useState<NotificationSettingsFocusItemId | null>(null);
  const {
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
  } = useNotificationSettingsState();

  const soundSelectOptions = NOTIFICATION_SOUND_OPTIONS.map((soundOption) => ({
    value: soundOption.soundId,
    label: t(soundOption.labelKey),
  }));

  useEffect(() => {
    if (!isNotificationSettingsFocusItemId(focusItemId)) {
      return;
    }
    if (isLoading) {
      return;
    }
    if (
      !isFocusableSettingsItemVisible({
        focusItemId,
        isAdvancedSettingsVisible: shouldShowAdvancedSettings,
        isSoundSettingsVisible: shouldShowSoundSettings,
      })
    ) {
      return;
    }

    const targetElement = document.getElementById(getNotificationSettingsAnchorId(focusItemId));
    if (!targetElement) {
      return;
    }

    targetElement.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    setHighlightedFocusItemId(focusItemId);

    const timeoutId = window.setTimeout(() => {
      setHighlightedFocusItemId((currentItem) => (currentItem === focusItemId ? null : currentItem));
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [focusItemId, isLoading, shouldShowAdvancedSettings, shouldShowSoundSettings]);

  /**
   * Resolves one compact visual status for the preview button area.
   */
  const previewIndicatorState: NotificationPreviewIndicatorState = isPreviewing
    ? "inProgress"
    : previewStatus === "sent"
      ? "success"
      : previewStatus === "blocked" || errorKey === "preview"
        ? "failed"
        : null;

  return (
    <Stack spacing={2}>
      <SettingsSectionHeader
        title={t("org.settings.notifications.title")}
        description={t("org.settings.notifications.subtitle")}
      />

      {isLoading ? <CenteredSpinner /> : null}

      {!isLoading && draft ? (
        <SettingsCard>
          <FocusableSettingsRow itemId="enabled" focusedItemId={highlightedFocusItemId}>
            <SettingsToggleRow
              title={t("org.settings.notifications.enabled")}
              checked={draft.enabled}
              disabled={isSaving}
              onChange={(nextChecked) => handleTogglePreference("enabled", nextChecked)}
            />
          </FocusableSettingsRow>
        </SettingsCard>
      ) : null}

      {!isLoading && draft && shouldShowAdvancedSettings ? (
        <Box>
          <SettingsSectionHeader
            title={t("org.settings.notifications.general.title")}
            description={t("org.settings.notifications.general.hint")}
            action={
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <SettingsCompactSelect
                  width={180}
                  value={previewEventType}
                  disabled={isSaving || isPreviewing || isSoundPreviewing}
                  slotProps={{ input: { "aria-label": t("org.settings.notifications.preview.eventTypeLabel") } }}
                  onChange={(event) => setPreviewEventType(event.target.value as NotificationEventType)}
                >
                  {NOTIFICATION_EVENT_OPTIONS.map((option) => (
                    <MenuItem key={option.type} value={option.type}>
                      {t(option.labelKey)}
                    </MenuItem>
                  ))}
                </SettingsCompactSelect>
                {previewIndicatorState ? (
                  <Box
                    role="img"
                    aria-label={t(`org.settings.notifications.preview.status.${previewIndicatorState}`)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color:
                        previewIndicatorState === "success"
                          ? "success.main"
                          : previewIndicatorState === "failed"
                            ? "error.main"
                            : "text.secondary",
                      "@keyframes notificationPreviewStatusSpin": {
                        from: { transform: "rotate(0deg)" },
                        to: { transform: "rotate(360deg)" },
                      },
                      "& .notification-preview-status-icon": {
                        transformOrigin: "center",
                        animation:
                          previewIndicatorState === "inProgress"
                            ? "notificationPreviewStatusSpin 0.8s linear infinite"
                            : "none",
                      },
                    }}
                  >
                    {previewIndicatorState === "success" ? (
                      <BiCheckCircle className="notification-preview-status-icon" size={16} />
                    ) : previewIndicatorState === "failed" ? (
                      <BiXCircle className="notification-preview-status-icon" size={16} />
                    ) : (
                      <BiLoaderAlt className="notification-preview-status-icon" size={16} />
                    )}
                  </Box>
                ) : null}
                <Button
                  variant="outlined"
                  size="small"
                  disabled={isSaving || isPreviewing || isSoundPreviewing}
                  onClick={handlePreviewNotification}
                >
                  {t("org.settings.notifications.preview.button")}
                </Button>
              </Stack>
            }
          />
          <SettingsCard>
            <SettingsRows>
              <FocusableSettingsRow itemId="os-enabled" focusedItemId={highlightedFocusItemId}>
                <SettingsToggleRow
                  title={t("org.settings.notifications.osEnabled")}
                  checked={draft.osEnabled}
                  disabled={isSaving}
                  onChange={(nextChecked) => handleTogglePreference("osEnabled", nextChecked)}
                />
              </FocusableSettingsRow>
              <FocusableSettingsRow itemId="focus-on-click" focusedItemId={highlightedFocusItemId}>
                <SettingsToggleRow
                  title={t("org.settings.notifications.focusOnClick")}
                  checked={draft.focusOnClick}
                  disabled={isSaving}
                  onChange={(nextChecked) => handleTogglePreference("focusOnClick", nextChecked)}
                />
              </FocusableSettingsRow>
            </SettingsRows>
          </SettingsCard>
        </Box>
      ) : null}

      {!isLoading && draft && shouldShowAdvancedSettings ? (
        <Box>
          <SettingsSectionHeader
            title={t("org.settings.notifications.sound.title")}
            description={t("org.settings.notifications.sound.hint")}
          />
          <SettingsCard>
            <SettingsRows>
              <FocusableSettingsRow itemId="sound-enabled" focusedItemId={highlightedFocusItemId}>
                <SettingsToggleRow
                  title={t("org.settings.notifications.soundEnabled")}
                  checked={draft.soundEnabled}
                  disabled={isSaving}
                  onChange={(nextChecked) => handleTogglePreference("soundEnabled", nextChecked)}
                />
              </FocusableSettingsRow>
              {shouldShowSoundSettings ? (
                <>
                  <FocusableSettingsRow itemId="volume" focusedItemId={highlightedFocusItemId}>
                    <SettingsVolumeRow
                      title={t("org.settings.notifications.volume")}
                      valuePercent={Math.round(draft.volume * 100)}
                      disabled={isSaving}
                      onChange={handleVolumeChange}
                      onChangeCommitted={handleVolumeChangeCommitted}
                    />
                  </FocusableSettingsRow>
                  {NOTIFICATION_EVENT_OPTIONS.map((option) => (
                    <FocusableSettingsRow
                      key={option.type}
                      itemId={EVENT_SOUND_FOCUS_IDS[option.type]}
                      focusedItemId={highlightedFocusItemId}
                    >
                      <SettingsSoundSelectRow
                        title={t(option.labelKey)}
                        value={draft.eventSounds[option.type]}
                        options={soundSelectOptions}
                        selectAriaLabel={`${t(option.labelKey)} ${t("org.settings.notifications.soundSelection")}`}
                        previewButtonAriaLabel={(soundOption) =>
                          `${soundOption.label} ${t("org.settings.notifications.preview.soundButton")}`
                        }
                        activePreviewValue={
                          activeSoundPreview?.eventType === option.type ? activeSoundPreview.soundId : null
                        }
                        disabled={isSaving}
                        onChange={(nextValue) => {
                          const nextSoundId = nextValue as NotificationSoundId;
                          handleSelectEventSound(option.type, nextSoundId);
                          void handlePreviewEventSound(option.type, nextSoundId);
                        }}
                        onPreview={(nextValue) => {
                          void handlePreviewEventSound(option.type, nextValue as NotificationSoundId);
                        }}
                      />
                    </FocusableSettingsRow>
                  ))}
                </>
              ) : null}
            </SettingsRows>
          </SettingsCard>
        </Box>
      ) : null}

      {!isLoading && draft && shouldShowAdvancedSettings ? (
        <Box>
          <SettingsSectionHeader
            title={t("org.settings.notifications.runTypes.title")}
            description={t("org.settings.notifications.runTypes.hint")}
          />
          <SettingsCard>
            <SettingsRows>
              {NOTIFICATION_RUN_TYPE_OPTIONS.map((option) => (
                <FocusableSettingsRow
                  key={option.category}
                  itemId={RUN_TYPE_FOCUS_IDS[option.category]}
                  focusedItemId={highlightedFocusItemId}
                >
                  <SettingsCheckboxRow
                    title={t(option.labelKey)}
                    checked={(draft.enabledCategories ?? []).includes(option.category)}
                    disabled={isSaving}
                    onChange={(nextChecked) => handleToggleCategory(option.category, nextChecked)}
                  />
                </FocusableSettingsRow>
              ))}
            </SettingsRows>
          </SettingsCard>
        </Box>
      ) : null}

      {!isLoading && draft && shouldShowAdvancedSettings ? (
        <Box>
          <SettingsSectionHeader
            title={t("org.settings.notifications.events.title")}
            description={t("org.settings.notifications.events.hint")}
          />
          <SettingsCard>
            <SettingsRows>
              {NOTIFICATION_EVENT_OPTIONS.map((option) => (
                <FocusableSettingsRow
                  key={option.type}
                  itemId={EVENT_FILTER_FOCUS_IDS[option.type]}
                  focusedItemId={highlightedFocusItemId}
                >
                  <SettingsCheckboxRow
                    title={t(option.labelKey)}
                    checked={(draft.enabledEventTypes ?? []).includes(option.type)}
                    disabled={isSaving}
                    onChange={(nextChecked) => handleToggleEventType(option.type, nextChecked)}
                  />
                </FocusableSettingsRow>
              ))}
            </SettingsRows>
          </SettingsCard>
        </Box>
      ) : null}

      {errorKey ? (
        <Alert severity="error">
          {t(
            `org.settings.notifications.errors.${
              errorKey === "load"
                ? "loadFailed"
                : errorKey === "save"
                  ? "saveFailed"
                  : errorKey === "preview"
                    ? "previewFailed"
                    : "previewSoundFailed"
            }`,
          )}
        </Alert>
      ) : null}
    </Stack>
  );
}
