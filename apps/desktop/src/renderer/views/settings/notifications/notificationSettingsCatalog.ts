export const NOTIFICATION_SETTINGS_FOCUS_ITEM_IDS = [
  "enabled",
  "os-enabled",
  "focus-on-click",
  "sound-enabled",
  "volume",
  "sound-run-finished",
  "sound-run-failed",
  "sound-pending-question",
  "run-type-ai-task",
  "event-run-finished",
  "event-run-failed",
  "event-pending-question",
] as const;

export type NotificationSettingsFocusItemId = (typeof NOTIFICATION_SETTINGS_FOCUS_ITEM_IDS)[number];

export type NotificationSettingsSearchItem = {
  id: NotificationSettingsFocusItemId;
  labelKey: string;
  keywordKeys: string[];
};

export const NOTIFICATION_SETTINGS_SEARCH_ITEMS: NotificationSettingsSearchItem[] = [
  {
    id: "enabled",
    labelKey: "org.settings.notifications.enabled",
    keywordKeys: ["org.settings.notifications.searchKeywords.enabled"],
  },
  {
    id: "os-enabled",
    labelKey: "org.settings.notifications.osEnabled",
    keywordKeys: ["org.settings.notifications.searchKeywords.osEnabled"],
  },
  {
    id: "focus-on-click",
    labelKey: "org.settings.notifications.focusOnClick",
    keywordKeys: ["org.settings.notifications.searchKeywords.focusOnClick"],
  },
  {
    id: "sound-enabled",
    labelKey: "org.settings.notifications.soundEnabled",
    keywordKeys: ["org.settings.notifications.searchKeywords.soundEnabled"],
  },
  {
    id: "volume",
    labelKey: "org.settings.notifications.volume",
    keywordKeys: ["org.settings.notifications.searchKeywords.volume"],
  },
  {
    id: "sound-run-finished",
    labelKey: "org.settings.notifications.events.runFinished",
    keywordKeys: ["org.settings.notifications.searchKeywords.soundRunFinished"],
  },
  {
    id: "sound-run-failed",
    labelKey: "org.settings.notifications.events.runFailed",
    keywordKeys: ["org.settings.notifications.searchKeywords.soundRunFailed"],
  },
  {
    id: "sound-pending-question",
    labelKey: "org.settings.notifications.events.pendingQuestion",
    keywordKeys: ["org.settings.notifications.searchKeywords.soundPendingQuestion"],
  },
  {
    id: "run-type-ai-task",
    labelKey: "org.settings.notifications.runTypes.items.ai-task",
    keywordKeys: ["org.settings.notifications.searchKeywords.runTypeAiTask"],
  },
  {
    id: "event-run-finished",
    labelKey: "org.settings.notifications.events.runFinished",
    keywordKeys: ["org.settings.notifications.searchKeywords.eventRunFinished"],
  },
  {
    id: "event-run-failed",
    labelKey: "org.settings.notifications.events.runFailed",
    keywordKeys: ["org.settings.notifications.searchKeywords.eventRunFailed"],
  },
  {
    id: "event-pending-question",
    labelKey: "org.settings.notifications.events.pendingQuestion",
    keywordKeys: ["org.settings.notifications.searchKeywords.eventPendingQuestion"],
  },
];

/**
 * Resolves one stable DOM anchor id for a notification settings item.
 */
export function getNotificationSettingsAnchorId(itemId: NotificationSettingsFocusItemId): string {
  return `notification-setting-${itemId}`;
}

/**
 * Narrows one optional raw value to a supported notification settings focus item id.
 */
export function isNotificationSettingsFocusItemId(
  value: string | null | undefined,
): value is NotificationSettingsFocusItemId {
  return typeof value === "string" && (NOTIFICATION_SETTINGS_FOCUS_ITEM_IDS as readonly string[]).includes(value);
}
