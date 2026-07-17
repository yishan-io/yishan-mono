import {
  Box,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { renderProjectIcon } from "@renderer/components/projectIcons";
import type { Dispatch, SetStateAction } from "react";
import { LuCircleHelp, LuExternalLink, LuFolderOpen } from "react-icons/lu";
import type { ProjectConfigDraft } from "../useProjectConfigFormState";
import { PROJECT_CONFIG_ICON_BG_COLOR_PRESETS } from "./projectConfigDialogConstants";

type ProjectConfigGeneralSectionProps = {
  draft: ProjectConfigDraft;
  isSaving: boolean;
  repoGitUrl: string;
  repoKey: string;
  repoLocalPath: string;
  setDraft: Dispatch<SetStateAction<ProjectConfigDraft>>;
  setIconAnchorEl: Dispatch<SetStateAction<HTMLElement | null>>;
  trimmedRepoLocalPath: string;
  onOpenRepoLocalPath: () => Promise<void>;
  onPickWorktreeFolder: () => Promise<void>;
};

export function ProjectConfigGeneralSection({
  draft,
  isSaving,
  repoGitUrl,
  repoKey,
  repoLocalPath,
  setDraft,
  setIconAnchorEl,
  trimmedRepoLocalPath,
  onOpenRepoLocalPath,
  onPickWorktreeFolder,
}: ProjectConfigGeneralSectionProps) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Repo name
        </Typography>
        <TextField
          size="small"
          disabled={isSaving}
          value={draft.name}
          onChange={(event) =>
            setDraft((previous) => ({
              ...previous,
              name: event.target.value,
            }))
          }
          fullWidth
          placeholder="-"
        />
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Git URL
        </Typography>
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          justifyContent="space-between"
          sx={{ minHeight: 40, px: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <Typography variant="body2" sx={{ color: repoGitUrl ? "text.primary" : "text.disabled" }}>
            {repoGitUrl || "-"}
          </Typography>
        </Stack>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Repo key
        </Typography>
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          justifyContent="space-between"
          sx={{ minHeight: 40, px: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <Typography variant="body2" sx={{ color: repoKey ? "text.primary" : "text.disabled" }}>
            {repoKey || "-"}
          </Typography>
        </Stack>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Local path
        </Typography>
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          justifyContent="space-between"
          sx={{ minHeight: 40, px: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <Typography variant="body2" sx={{ color: repoLocalPath ? "text.primary" : "text.disabled" }}>
            {repoLocalPath || "-"}
          </Typography>
          <Tooltip title="Open in Finder" arrow>
            <span>
              <IconButton
                size="small"
                aria-label="Open local path in Finder"
                disabled={!trimmedRepoLocalPath}
                onClick={() => void onOpenRepoLocalPath()}
              >
                <LuExternalLink size={14} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>
      <Box>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Context
          </Typography>
          <Tooltip
            title="Context stores repo-specific notes and guidance (briefs, decisions, references) outside the git repo so agents can reuse it across workspaces. This switch controls whether Yishan maintains the .my-context link in this project's workspaces."
            arrow
          >
            <IconButton size="small" aria-label="What is context?" sx={{ p: 0.25 }}>
              <LuCircleHelp size={14} />
            </IconButton>
          </Tooltip>
        </Stack>
        <FormControlLabel
          sx={{ ml: 0 }}
          control={
            <Switch
              checked={draft.contextEnabled}
              disabled={isSaving}
              onChange={(_event, checked) =>
                setDraft((previous) => ({
                  ...previous,
                  contextEnabled: checked,
                }))
              }
            />
          }
          label={draft.contextEnabled ? "Enabled" : "Disabled"}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Toggling applies to all current workspaces and future ones.
        </Typography>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Worktree location
        </Typography>
        <TextField
          size="small"
          value={draft.worktreePath}
          disabled={isSaving}
          fullWidth
          slotProps={{
            input: {
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Choose folder" arrow>
                    <IconButton
                      edge="end"
                      aria-label="Choose worktree folder"
                      disabled={isSaving}
                      onClick={() => void onPickWorktreeFolder()}
                    >
                      <LuFolderOpen size={18} />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      <Stack direction="row" spacing={2}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Project icon
          </Typography>
          <IconButton
            aria-label="Choose project icon"
            onClick={(event) => setIconAnchorEl(event.currentTarget)}
            disabled={isSaving}
            sx={{
              width: 40,
              height: 40,
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
            }}
          >
            {renderProjectIcon(draft.icon, 18)}
          </IconButton>
        </Box>
        <Box sx={{ width: 220 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Icon bg color
          </Typography>
          <Stack direction="row" spacing={1} sx={{ pt: 0.75 }}>
            {PROJECT_CONFIG_ICON_BG_COLOR_PRESETS.map((color) => {
              const selected = draft.color.toLowerCase() === color.toLowerCase();
              return (
                <Tooltip key={color} title={color} arrow>
                  <IconButton
                    size="small"
                    aria-label={`Select ${color}`}
                    disabled={isSaving}
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        color,
                      }))
                    }
                    sx={{
                      width: 24,
                      height: 24,
                      p: 0,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: 1,
                      borderColor: selected ? "text.primary" : "divider",
                    }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        bgcolor: color,
                      }}
                    />
                  </IconButton>
                </Tooltip>
              );
            })}
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}
