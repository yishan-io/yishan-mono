import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createOrganization, listOrganizations } from "../../api";
import { loadWorkspaceFromBackend } from "../../commands/projectCommands";
import { rendererQueryClient } from "../../queryClient";
import { sessionStore } from "../../store/sessionStore";

type CreateOrganizationDialogViewProps = {
  open: boolean;
  onClose: () => void;
};

/** Renders modal flow for creating one organization and switching context to it. */
export function CreateOrganizationDialogView({ open, onClose }: CreateOrganizationDialogViewProps) {
  const { t } = useTranslation();
  const [organizationName, setOrganizationName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetAndClose = () => {
    if (isCreating) {
      return;
    }
    setOrganizationName("");
    setErrorMessage(null);
    onClose();
  };

  const submit = () => {
    const normalizedOrganizationName = organizationName.trim();
    if (!normalizedOrganizationName || isCreating) {
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const createdOrganization = await createOrganization(normalizedOrganizationName);
        const nextOrganizations = await listOrganizations();
        const currentUser = sessionStore.getState().currentUser;
        sessionStore.getState().setSessionData({
          currentUser,
          organizations: nextOrganizations,
          selectedOrganizationId: createdOrganization.id,
        });
        setOrganizationName("");
        setErrorMessage(null);
        setIsCreating(false);
        onClose();
        void rendererQueryClient.invalidateQueries({ queryKey: ["org-project-snapshot"] });
        void loadWorkspaceFromBackend();
      } catch {
        setErrorMessage(t("org.menu.newOrganizationFailed"));
        setIsCreating(false);
      }
    })();
  };

  return (
    <Dialog open={open} onClose={resetAndClose} fullWidth maxWidth="xs">
      <DialogTitle>{t("org.menu.newOrganization")}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder={t("org.menu.newOrganizationPrompt")}
            inputProps={{ "aria-label": t("org.menu.newOrganizationPrompt") }}
            value={organizationName}
            onChange={(event) => {
              setOrganizationName(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            disabled={isCreating}
          />
          {errorMessage ? (
            <Typography variant="caption" color="error">
              {errorMessage}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={resetAndClose} disabled={isCreating}>
          {t("common.actions.cancel")}
        </Button>
        <Button variant="contained" onClick={submit} disabled={!organizationName.trim() || isCreating}>
          {t("project.form.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
