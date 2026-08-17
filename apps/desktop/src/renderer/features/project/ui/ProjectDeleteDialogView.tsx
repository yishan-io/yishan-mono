import { useTranslation } from "react-i18next";
import { ConfirmationDialog } from "../../../components/ConfirmationDialog";

type ProjectDeleteDialogViewProps = {
  open: boolean;
  repoName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Renders repository deletion confirmation dialog. */
export function ProjectDeleteDialogView({
  open,
  repoName,
  isDeleting,
  onCancel,
  onConfirm,
}: ProjectDeleteDialogViewProps) {
  const { t } = useTranslation();

  return (
    <ConfirmationDialog
      open={open}
      title={t("project.actions.delete")}
      description={t("project.delete.confirm", { name: repoName })}
      confirmLabel={
        isDeleting ? t("common.actions.deleting", { defaultValue: "Deleting..." }) : t("project.actions.delete")
      }
      cancelLabel={t("common.actions.cancel")}
      confirmColor="error"
      isSubmitting={isDeleting}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
