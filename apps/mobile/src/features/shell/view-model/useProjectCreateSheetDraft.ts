import { useCallback, useMemo, useState } from "react";

import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { validateCreateProjectForm } from "@/features/projects/forms/project-form";
import { createEmptyProjectCreateDraft } from "../commands/project-create-sheet-domain";

export function useProjectCreateSheetDraft() {
  const { t } = useAppLanguage();
  const [draft, setDraft] = useState(createEmptyProjectCreateDraft);

  const formErrors = useMemo(() => validateCreateProjectForm(draft, t), [draft, t]);

  const resetDraft = useCallback(() => {
    setDraft(createEmptyProjectCreateDraft());
  }, []);

  return {
    formErrors,
    name: draft.name,
    onChangeName: (name: string) => setDraft((current) => ({ ...current, name })),
    onChangeRepoUrl: (repoUrl: string) => setDraft((current) => ({ ...current, repoUrl })),
    repoUrl: draft.repoUrl,
    resetDraft,
    t,
  };
}
