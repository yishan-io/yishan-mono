import { Box, Button, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuSendHorizontal } from "react-icons/lu";

type SessionComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
};

export function SessionComposer({ value, onChange, onSend }: SessionComposerProps) {
  const { t } = useTranslation();

  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <TextField
        size="medium"
        fullWidth
        multiline
        minRows={2}
        maxRows={8}
        placeholder={t("composer.placeholder")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <Button variant="contained" startIcon={<LuSendHorizontal />} onClick={onSend}>
        {t("composer.send")}
      </Button>
    </Box>
  );
}
