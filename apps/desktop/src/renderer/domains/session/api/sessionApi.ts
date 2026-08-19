import { requestJson } from "@renderer/api/restClient";
import type { OrganizationRecord } from "@renderer/api/types";
import type { SupportedLanguageCode } from "@renderer/i18n";
import type { NotificationPreferences } from "@shared/notifications/notificationPreferences";

export type CurrentUserRecord = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  languagePreference?: SupportedLanguageCode;
  notificationPreferences: NotificationPreferences;
};

export async function updateLanguagePreference(
  languagePreference: SupportedLanguageCode,
): Promise<SupportedLanguageCode> {
  const response = await requestJson<{ languagePreference: SupportedLanguageCode }>("/language-preference", {
    method: "PUT",
    body: { languagePreference },
  });
  return response.languagePreference;
}

/** Loads current authenticated user profile from remote API. */
export async function getCurrentUser(): Promise<CurrentUserRecord> {
  const response = await requestJson<{ user: CurrentUserRecord }>("/me");
  return response.user;
}
