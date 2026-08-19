import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { addOrgMember } from "../../commands/orgCommands";

type AddMemberRole = "member" | "admin";

interface AddOrgMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (invited: boolean) => void;
}

const FIELD_LABEL_SX = { display: "block", mb: 0.5, fontWeight: 600 } as const;

/**
 * Dialog for adding a new member to the currently selected organization.
 * When the email address has no account yet, an invitation is sent and
 * `onSuccess` is called with `invited: true`.
 */
export function AddOrgMemberDialog({ isOpen, onClose, onSuccess }: AddOrgMemberDialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AddMemberRole>("member");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    setEmail("");
    setRole("member");
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setSubmitError(t("settings.members.addDialog.errorEmailEmpty"));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { invited } = await addOrgMember(trimmedEmail, role);
      setEmail("");
      setRole("member");
      onSuccess(invited);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [email, role, t, onSuccess, onClose]);

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("settings.members.addDialog.title")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}
          <Box>
            <Typography variant="caption" component="label" htmlFor="add-member-email" sx={FIELD_LABEL_SX}>
              {t("settings.members.addDialog.emailLabel")}
            </Typography>
            <TextField
              id="add-member-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              autoFocus
              fullWidth
              type="email"
              placeholder={t("settings.members.addDialog.emailPlaceholder")}
            />
          </Box>
          <Box>
            <Typography variant="caption" component="label" htmlFor="add-member-role" sx={FIELD_LABEL_SX}>
              {t("settings.members.addDialog.roleLabel")}
            </Typography>
            <Select
              inputProps={{ id: "add-member-role" }}
              value={role}
              onChange={(event) => setRole(event.target.value as AddMemberRole)}
              disabled={isSubmitting}
              size="small"
              fullWidth
            >
              <MenuItem value="member">{t("settings.members.addDialog.roles.member")}</MenuItem>
              <MenuItem value="admin">{t("settings.members.addDialog.roles.admin")}</MenuItem>
            </Select>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          {t("common.actions.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting} variant="contained" disableElevation>
          {isSubmitting ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} color="inherit" />
              <Typography variant="body2">{t("settings.members.addDialog.adding")}</Typography>
            </Box>
          ) : (
            t("settings.members.addDialog.submit")
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
