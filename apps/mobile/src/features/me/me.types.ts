import type { NotificationPreferences } from "@/features/notifications/notifications.types";

export type LanguagePreference = "en" | "zh";

export type MeUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  languagePreference: LanguagePreference;
  notificationPreferences: NotificationPreferences;
};
