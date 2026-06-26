import { StatusCodes } from "http-status-codes";

import type { AppContext } from "@/hono";
import { normalizeUserPreferences } from "@/lib/user-preferences";
import type { UpdateLanguagePreferenceBodyInput, UpdateNotificationPreferencesBodyInput } from "@/validation/user";

export async function meHandler(c: AppContext) {
  const sessionUser = c.get("sessionUser");
  const user = await c.get("services").user.getById(sessionUser.id);
  if (!user) {
    return c.json({ error: "User not found" }, StatusCodes.NOT_FOUND);
  }
  const userPreferences = normalizeUserPreferences(user.userPreferences);
  return c.json({
    user: {
      ...user,
      languagePreference: userPreferences.languagePreference,
      notificationPreferences: userPreferences.notificationPreferences,
    },
  });
}

export async function updateLanguagePreferenceHandler(c: AppContext, body: UpdateLanguagePreferenceBodyInput) {
  const actorUser = c.get("sessionUser");
  const languagePreference = await c
    .get("services")
    .user.updateLanguagePreference(actorUser.id, body.languagePreference);
  return c.json({ languagePreference });
}

export async function updateNotificationPreferencesHandler(
  c: AppContext,
  body: UpdateNotificationPreferencesBodyInput,
) {
  const actorUser = c.get("sessionUser");
  const preferences = await c.get("services").user.updateNotificationPreferences(actorUser.id, body);
  return c.json({ preferences });
}
