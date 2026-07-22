import { Box, Stack, TextField, Typography } from "@mui/material";
import type { Dispatch, SetStateAction } from "react";
import type { ProjectConfigDraft } from "../useProjectConfigFormState";

type ProjectConfigScriptsSectionProps = {
  draft: ProjectConfigDraft;
  isSaving: boolean;
  setDraft: Dispatch<SetStateAction<ProjectConfigDraft>>;
};

export function ProjectConfigScriptsSection({ draft, isSaving, setDraft }: ProjectConfigScriptsSectionProps) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Setup script
        </Typography>
        <TextField
          multiline
          minRows={3}
          value={draft.setupScript}
          disabled={isSaving}
          onChange={(event) =>
            setDraft((previous) => ({
              ...previous,
              setupScript: event.target.value,
            }))
          }
          fullWidth
          placeholder="Runs in new workspace worktree after creation"
        />
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Post script
        </Typography>
        <TextField
          multiline
          minRows={3}
          value={draft.postScript}
          disabled={isSaving}
          onChange={(event) =>
            setDraft((previous) => ({
              ...previous,
              postScript: event.target.value,
            }))
          }
          fullWidth
          placeholder="Runs in workspace worktree before deletion"
        />
      </Box>
    </Stack>
  );
}
