import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateLanguagePreference, updateNotificationPreferenceEnabled } from "@/features/me/me.api";
import type { LanguagePreference } from "@/features/me/me.types";
import { queryKeys } from "@/lib/query/query-keys";

export function useSettingsPreferenceMutations({
  accessToken,
  setLanguagePreference,
}: {
  accessToken: string | null | undefined;
  setLanguagePreference: (preference: LanguagePreference) => Promise<void>;
}) {
  const queryClient = useQueryClient();

  const languageMutation = useMutation({
    mutationFn: async (languagePreference: LanguagePreference) => {
      if (!accessToken) throw new Error("Missing access token");
      return updateLanguagePreference(accessToken, languagePreference);
    },
    onSuccess: async (_data, nextLanguage) => {
      await setLanguagePreference(nextLanguage);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });

  const notificationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!accessToken) throw new Error("Missing access token");
      return updateNotificationPreferenceEnabled(accessToken, enabled);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });

  return {
    hasMutationError: languageMutation.isError || notificationMutation.isError,
    languageMutation,
    notificationMutation,
    onSelectLanguage: (language: LanguagePreference) => languageMutation.mutate(language),
    onToggleNotifications: (enabled: boolean) => notificationMutation.mutate(enabled),
  };
}
