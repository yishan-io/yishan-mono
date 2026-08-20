import { Stack, TextField, Typography } from "@mui/material";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduledJobFormDraft } from "../hooks/useScheduledJobFormState";

const runbookLabelSx = { letterSpacing: "0.08em", fontWeight: 700 };

interface ScheduledJobPromptFieldsProps {
  draft: ScheduledJobFormDraft;
  setDraft: Dispatch<SetStateAction<ScheduledJobFormDraft>>;
  isBusy: boolean;
}

function ScheduledJobPromptFields({ draft, setDraft, isBusy }: ScheduledJobPromptFieldsProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={1.25}>
      <TextField
        size="medium"
        autoFocus
        fullWidth
        disabled={isBusy}
        value={draft.name}
        onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, name: event.target.value }))}
        placeholder={t("scheduledJob.form.namePlaceholder")}
      />
      <Typography variant="caption" sx={[{ color: "text.secondary" }, runbookLabelSx]}>
        {t("scheduledJob.form.runbook")}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {t("scheduledJob.form.runbookHint")}
      </Typography>
      <TextField
        size="medium"
        fullWidth
        multiline
        minRows={18}
        maxRows={24}
        disabled={isBusy}
        value={draft.prompt}
        onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, prompt: event.target.value }))}
        placeholder={t("scheduledJob.form.promptPlaceholder")}
      />
    </Stack>
  );
}

export { ScheduledJobPromptFields };
