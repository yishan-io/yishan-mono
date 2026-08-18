import type { NotificationPreferences } from "../../../../shared/notifications/notificationPreferences";
import type { SupportedLanguageCode } from "../../../i18n";

/**
 * Session domain model — stable identity and session concepts.
 *
 * Owned by the Session Domain (Domains plan D3). These types describe the
 * signed-in Desktop session: the current user, the organization list, and
 * the active organization identity. They are pure data types with no React,
 * Zustand, transport, or State dependency.
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  languagePreference?: SupportedLanguageCode;
  notificationPreferences?: NotificationPreferences;
};

export type SessionOrganization = {
  id: string;
  name: string;
  plan?: "free" | "pro" | "premium";
  members?: Array<{ userId: string; role: string }>;
  voiceUsage?: {
    quotaMinutes: number;
    usedSeconds: number;
    remainingSeconds: number;
  };
};
