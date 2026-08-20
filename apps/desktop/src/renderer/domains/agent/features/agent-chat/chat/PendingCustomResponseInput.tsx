import { Button, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";

type PendingCustomResponseInputProps = {
  placeholder: string | undefined;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  onBack: () => void;
  onCancel: () => void;
};

/** Multiline free-form input for custom responses (shared by select + multi-select prompts). */
export function PendingCustomResponseInput({
  placeholder,
  draft,
  onDraftChange,
  onSubmit,
  onBack,
  onCancel,
}: PendingCustomResponseInputProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={1}>
      <TextField
        fullWidth
        multiline
        minRows={3}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
      />
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" onClick={() => void onSubmit()}>
          {t("common.actions.submit")}
        </Button>
        <Button size="small" variant="text" color="inherit" onClick={onBack}>
          {t("common.actions.back")}
        </Button>
        <Button size="small" variant="text" color="inherit" onClick={onCancel}>
          {t("common.actions.cancel")}
        </Button>
      </Stack>
    </Stack>
  );
}
