import { Box, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from "@mui/material";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { LuExternalLink, LuFolderOpen } from "react-icons/lu";
import type { ProjectConfigDraft } from "../useProjectConfigFormState";

type ProjectConfigPathSectionProps = {
  kind: "local" | "worktree";
  draft: ProjectConfigDraft;
  isSaving: boolean;
  setDraft: Dispatch<SetStateAction<ProjectConfigDraft>>;
  trimmedRepoLocalPath?: string;
  onOpenRepoLocalPath?: () => Promise<void>;
  onPickFolder: () => Promise<void>;
};

/** Path controls keep the project checkout separate from the new-workspace root. */
export function ProjectConfigPathSection({
  kind,
  draft,
  isSaving,
  setDraft,
  trimmedRepoLocalPath,
  onOpenRepoLocalPath,
  onPickFolder,
}: ProjectConfigPathSectionProps) {
  const { t } = useTranslation();
  const isLocal = kind === "local";
  const fieldLabel = t(isLocal ? "project.config.localPath" : "project.config.worktreeLocation");
  const pickerLabel = t(isLocal ? "project.config.chooseLocalFolder" : "project.config.chooseWorktreeFolder");
  return (
    <Box>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
        {fieldLabel}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <TextField
          value={isLocal ? draft.localPath : draft.worktreePath}
          disabled={isSaving}
          fullWidth
          onChange={(event) => setDraft((previous) => ({ ...previous, localPath: event.target.value }))}
          slotProps={{
            htmlInput: { "aria-label": fieldLabel },
            input: {
              readOnly: !isLocal,
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={t("project.form.chooseFolder")}>
                    <IconButton
                      size="medium"
                      edge="end"
                      aria-label={pickerLabel}
                      disabled={isSaving}
                      onClick={() => void onPickFolder()}
                    >
                      <LuFolderOpen size={18} />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
        {isLocal && (
          <Tooltip title={t("project.config.openLocalPath")}>
            <Box component="span">
              <IconButton
                aria-label={t("project.config.openLocalPath")}
                disabled={isSaving || !trimmedRepoLocalPath}
                onClick={() => void onOpenRepoLocalPath?.()}
              >
                <LuExternalLink size={14} />
              </IconButton>
            </Box>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}
