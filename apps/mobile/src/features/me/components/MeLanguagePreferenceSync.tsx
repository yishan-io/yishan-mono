import { useEffect } from "react";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useMeQuery } from "@/features/me/queries/useMeQuery";

export function MeLanguagePreferenceSync() {
  const { preference: languagePreference, setPreference: setLanguagePreference } = useAppLanguage();
  const meQuery = useMeQuery();

  useEffect(() => {
    const nextLanguage = meQuery.data?.languagePreference;
    if (nextLanguage && nextLanguage !== languagePreference) {
      void setLanguagePreference(nextLanguage);
    }
  }, [languagePreference, meQuery.data?.languagePreference, setLanguagePreference]);

  return null;
}
