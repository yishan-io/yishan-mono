import type { NotificationPreferences } from "@/features/notifications/notifications.types";
import type { LanguagePreference, MeUser } from "./me.types";

export type MeUserRecord = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  languagePreference: LanguagePreference;
  notificationPreferences: NotificationPreferences;
};

export type MeResponseRecord = {
  user: MeUserRecord;
};

export function normalizeMeUser(record: MeUserRecord): MeUser {
  return {
    avatarUrl: record.avatarUrl,
    email: record.email,
    id: record.id,
    languagePreference: record.languagePreference,
    name: record.name,
    notificationPreferences: record.notificationPreferences,
  };
}
