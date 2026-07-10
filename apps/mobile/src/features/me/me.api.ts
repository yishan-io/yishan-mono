import type { NotificationPreferences } from "@/features/notifications/notifications.types";
import { apiRequest } from "@/lib/api/client";
import { type MeResponseRecord, normalizeMeUser } from "./me-domain";
import type { LanguagePreference, MeUser } from "./me.types";

// Owns transport wiring and DTO normalization for the authenticated current-user feature shape.
export async function getMe(accessToken: string): Promise<MeUser> {
  const response = await apiRequest<MeResponseRecord>("/me", {
    accessToken,
  });

  return normalizeMeUser(response.user);
}

export async function updateLanguagePreference(accessToken: string, languagePreference: LanguagePreference) {
  return apiRequest<{ languagePreference: LanguagePreference }>("/language-preference", {
    method: "PUT",
    accessToken,
    body: { languagePreference },
  });
}

export async function updateNotificationPreferenceEnabled(accessToken: string, enabled: boolean) {
  return apiRequest<{ preferences: NotificationPreferences }>("/notification-preferences", {
    method: "PUT",
    accessToken,
    body: { enabled },
  });
}
