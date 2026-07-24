import { Alert, Box } from "@mui/material";
import { ConfirmationDialog } from "@renderer/components/ConfirmationDialog";
import { useTranslation } from "react-i18next";

type PendingFileDeletion = {
  paths: string[];
  hasDirectory: boolean;
};

type FileDeletionFeedbackProps = {
  pendingFileDeletion: PendingFileDeletion | null;
  pendingFileDeletionDescriptionKey: string;
  isDeletingEntry: boolean;
  deletionError: { failCount: number; total: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDismissError: () => void;
};

/** Renders the delete confirmation dialog and any post-delete error banner. */
export function FileDeletionFeedback({
  pendingFileDeletion,
  pendingFileDeletionDescriptionKey,
  isDeletingEntry,
  deletionError,
  onConfirm,
  onCancel,
  onDismissError,
}: FileDeletionFeedbackProps) {
  const { t } = useTranslation();

  return (
    <>
      {deletionError ? (
        <Box sx={{ px: 1.5, pt: 1, flexShrink: 0 }}>
          <Alert severity="error" onClose={onDismissError} data-testid="deletion-error">
            {deletionError.failCount === deletionError.total
              ? t("files.delete.errorAllFailed")
              : t("files.delete.errorPartialFailed", {
                  succeeded: deletionError.total - deletionError.failCount,
                  total: deletionError.total,
                  failed: deletionError.failCount,
                })}
          </Alert>
        </Box>
      ) : null}
      <ConfirmationDialog
        open={Boolean(pendingFileDeletion)}
        title={t("files.actions.delete")}
        description={t(pendingFileDeletionDescriptionKey, {
          path: pendingFileDeletion?.paths[0] ?? "",
          count: pendingFileDeletion?.paths.length ?? 0,
        })}
        confirmLabel={
          isDeletingEntry ? t("common.actions.deleting", { defaultValue: "Deleting..." }) : t("files.actions.delete")
        }
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isDeletingEntry}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </>
  );
}
