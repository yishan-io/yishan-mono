import type { NotificationPreferences } from "../../shared/notifications/notificationPreferences";
import type { SupportedLanguageCode } from "../i18n";
import { api } from "./client";
import { requestJson } from "./restClient";
import type { OrganizationRecord } from "./types";

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

/** Loads session bootstrap data required by renderer app state. */
export async function getSessionBootstrapData(): Promise<{
  currentUser: CurrentUserRecord;
  organizations: OrganizationRecord[];
}> {
  const [currentUser, organizations] = await Promise.all([getCurrentUser(), api.org.list()]);
  return { currentUser, organizations };
}
