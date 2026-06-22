import { useCallback } from "react";

import { isProjectCreateSubmitDisabled } from "../commands/project-create-sheet-domain";
import { useProjectCreateSheetSubmit } from "../commands/useProjectCreateSheetSubmit";
import { useProjectCreateSheetDraft } from "./useProjectCreateSheetDraft";

export function useProjectCreateSheetModel({
  onClose,
  organizationId,
}: {
  onClose: () => void;
  organizationId: string | null;
}) {
  const draft = useProjectCreateSheetDraft();
  const submit = useProjectCreateSheetSubmit({
    draft: {
      name: draft.name,
      repoUrl: draft.repoUrl,
    },
    onClose,
    organizationId,
    resetDraft: draft.resetDraft,
  });

  const handleClose = useCallback(() => {
    draft.resetDraft();
    onClose();
  }, [draft.resetDraft, onClose]);

  return {
    createMutation: submit.createMutation,
    formErrors: draft.formErrors,
    handleClose,
    isSubmitDisabled: isProjectCreateSubmitDisabled({
      createPending: submit.createMutation.isPending,
      formErrors: draft.formErrors,
      organizationId,
    }),
    name: draft.name,
    onChangeName: draft.onChangeName,
    onChangeRepoUrl: draft.onChangeRepoUrl,
    onSubmit: submit.onSubmit,
    repoUrl: draft.repoUrl,
    t: draft.t,
  };
}
