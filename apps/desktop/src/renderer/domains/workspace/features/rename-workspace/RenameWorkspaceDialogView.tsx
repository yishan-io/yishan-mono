import { Dialog, DialogContent, DialogTitle, Stack } from "@mui/material";
import { useDialogRegistration } from "@renderer/domains/workbench";
import { getRendererPlatform } from "@renderer/platform/platform";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useTranslation } from "react-i18next";
import { useSelectedOrganizationId } from "../../../../domains/session";
import { workspaceStore } from "../../state/workspaceStore";
import { WorkspaceDetailsSection } from "../../ui/WorkspaceDetailsSection";
import { WorkspaceDialogSubmitButton } from "../../ui/WorkspaceDialogSubmitButton";
import { useRenameWorkspaceDialogState } from "./useRenameWorkspaceDialogState";

type RenameWorkspaceDialogViewProps = {
  open: boolean;
  projectId: string;
  workspaceId?: string;
  onClose: () => void;
};

/** Renders the workspace rename dialog (desktop7 Phase 24 — split from create-workspace). */
export function RenameWorkspaceDialogView({ open, projectId, workspaceId, onClose }: RenameWorkspaceDialogViewProps) {
  const { t } = useTranslation();
  const organizationId = useSelectedOrganizationId();
  const workspaces = workspaceStore((state) => state.workspaces);

  useDialogRegistration(open);

  const { name, setName, targetBranch, setTargetBranch, isSaving, canRename, handleRename } =
    useRenameWorkspaceDialogState({ open, projectId, workspaceId, workspaces });

  const handleSubmit = async () => {
    const renamed = await handleRename();
    if (renamed) {
      onClose();
    }
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canRename) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const submitShortcutLabel = getRendererPlatform() === "darwin" ? "⌘↵" : "Ctrl+↵";

  return (
    <Dialog open={open} onClose={onClose} onKeyDown={handleDialogKeyDown} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>{t("workspace.rename.title")}</DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <WorkspaceDetailsSection
            name={name}
            onNameChange={setName}
            targetBranch={targetBranch}
            branchInputPlaceholder={t("workspace.rename.branchNameLabel")}
            onTargetBranchChange={setTargetBranch}
          />
          <WorkspaceDialogSubmitButton
            submitLabel={t("workspace.actions.rename")}
            submitShortcutLabel={submitShortcutLabel}
            isCreatingWorkspace={isSaving}
            disabled={!canRename}
            onClick={() => {
              void handleSubmit().catch((error) => {
                console.error("Failed to rename workspace from dialog", getErrorMessage(error));
              });
            }}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
