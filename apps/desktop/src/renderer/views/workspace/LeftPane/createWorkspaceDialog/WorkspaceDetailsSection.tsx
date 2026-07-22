import { Box, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuGitBranch } from "react-icons/lu";

type WorkspaceDetailsSectionProps = {
  name: string;
  onNameChange: (name: string) => void;
  targetBranch: string;
  branchInputPlaceholder: string;
  onTargetBranchChange: (branch: string) => void;
};

/** Renders shared workspace name and target-branch inputs for create and rename modes. */
export function WorkspaceDetailsSection({
  name,
  onNameChange,
  targetBranch,
  branchInputPlaceholder,
  onTargetBranchChange,
}: WorkspaceDetailsSectionProps) {
  const { t } = useTranslation();

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {t("workspace.create.nameLabel")}
        </Typography>
        <TextField
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t("workspace.create.namePlaceholder")}
          fullWidth
        />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
          {t("workspace.create.branchLabel")}
        </Typography>
        <TextField
          fullWidth
          placeholder={branchInputPlaceholder}
          value={targetBranch}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.75 }}>
                <LuGitBranch size={14} color="currentColor" />
              </InputAdornment>
            ),
          }}
          onChange={(event) => onTargetBranchChange(event.target.value)}
        />
      </Box>
    </Stack>
  );
}
