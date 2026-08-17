import { Box, Button, ButtonGroup, Menu, MenuItem, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown } from "react-icons/lu";

export type ChangesCommitActionsPrimaryAction = "disabled" | "commit" | "push" | "publish";

type ChangesCommitActionsViewProps = {
  commitMessageDraft: string;
  primaryGitAction: ChangesCommitActionsPrimaryAction;
  onCommitMessageDraftChange: (nextDraft: string) => void;
  onRunPrimaryGitAction: () => void;
  onCommitWithOptions: (input: { amend?: boolean; signoff?: boolean }) => void;
};

/** Resolves the localized label for the primary git action button state. */
function resolvePrimaryGitActionLabel(
  primaryGitAction: ChangesCommitActionsPrimaryAction,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (primaryGitAction === "push") {
    return t("files.git.push");
  }

  if (primaryGitAction === "publish") {
    return t("files.git.publishBranch");
  }

  return t("files.git.commit");
}

/** Renders commit message and submit controls extracted from the Changes pane. */
export function ChangesCommitActionsView({
  commitMessageDraft,
  primaryGitAction,
  onCommitMessageDraftChange,
  onRunPrimaryGitAction,
  onCommitWithOptions,
}: ChangesCommitActionsViewProps) {
  const { t } = useTranslation();
  const [commitMenuAnchor, setCommitMenuAnchor] = useState<HTMLElement | null>(null);
  const primaryGitActionLabel = resolvePrimaryGitActionLabel(primaryGitAction, t);
  const isPrimaryActionDisabled =
    primaryGitAction === "disabled" || (primaryGitAction === "commit" && commitMessageDraft.trim().length === 0);

  return (
    <Box data-testid="changes-commit-actions-view" sx={{ minWidth: 0 }}>
      <TextField
        size="medium"
        multiline
        minRows={3}
        maxRows={8}
        fullWidth
        value={commitMessageDraft}
        onChange={(event) => onCommitMessageDraftChange(event.target.value)}
        placeholder={t("files.git.commitPlaceholder")}
        slotProps={{ htmlInput: { "aria-label": t("files.git.commitPlaceholder") } }}
        sx={{
          minWidth: 0,
          "& .MuiOutlinedInput-root": { p: 1 },
          "& .MuiOutlinedInput-notchedOutline": { borderWidth: 1 },
          "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 1 },
          "& .MuiInputBase-input": { fontSize: 14 },
        }}
      />
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.75, minWidth: 0 }}>
        <ButtonGroup
          variant="contained"
          size="small"
          disabled={isPrimaryActionDisabled}
          sx={{
            "& .MuiButton-root": {
              py: 0.125,
              minHeight: 24,
              lineHeight: 1.1,
              fontSize: 13,
            },
            "& .MuiButtonGroup-grouped": { minWidth: 0 },
          }}
        >
          <Button sx={{ "&&": { px: 2 } }} onClick={onRunPrimaryGitAction}>
            {primaryGitActionLabel}
          </Button>
          <Button
            sx={{ "&&": { minWidth: 24, px: 0.125 } }}
            aria-label={t("files.git.commitOptions")}
            aria-haspopup="menu"
            aria-expanded={Boolean(commitMenuAnchor)}
            disabled={primaryGitAction !== "commit"}
            onClick={(event) => setCommitMenuAnchor(event.currentTarget)}
          >
            <LuChevronDown size={14} />
          </Button>
        </ButtonGroup>
        <Menu open={Boolean(commitMenuAnchor)} anchorEl={commitMenuAnchor} onClose={() => setCommitMenuAnchor(null)}>
          <MenuItem
            onClick={() => {
              setCommitMenuAnchor(null);
              onCommitWithOptions({ amend: true });
            }}
          >
            <Box sx={{ width: 220, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="body2">{t("files.git.amend")}</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {t("files.git.amendShortcut")}
              </Typography>
            </Box>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setCommitMenuAnchor(null);
              onCommitWithOptions({ signoff: true });
            }}
          >
            <Typography variant="body2">{t("files.git.signoff")}</Typography>
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}
