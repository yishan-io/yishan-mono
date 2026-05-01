import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Popover,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuCircleHelp, LuExternalLink, LuFolderOpen } from "react-icons/lu";
import { SYSTEM_FILE_MANAGER_APP_ID } from "../../../../shared/contracts/externalApps";
import {
  DEFAULT_PROJECT_ICON_ID,
  PROJECT_ICON_OPTIONS,
  findProjectIconOption,
  renderProjectIcon,
} from "../../../components/projectIcons";
import { useCommands } from "../../../hooks/useCommands";
import { workspaceStore } from "../../../store/workspaceStore";

type ProjectConfigDialogViewProps = {
  open: boolean;
  repoId: string;
  onClose: () => void;
};

type ProjectConfigDraft = {
  name: string;
  worktreePath: string;
  contextEnabled: boolean;
  icon: string;
  color: string;
  setupScript: string;
  postScript: string;
};

const DEFAULT_ICON_BG_COLOR = "#1E66F5";
const ICON_BG_COLOR_PRESETS = ["#1E66F5", "#0F766E", "#CA8A04", "#DC2626", "#7C3AED", "#DB2777", "#0891B2"];

function getDefaultDraft(): ProjectConfigDraft {
  return {
    name: "",
    worktreePath: "",
    contextEnabled: true,
    icon: DEFAULT_PROJECT_ICON_ID,
    color: DEFAULT_ICON_BG_COLOR,
    setupScript: "",
    postScript: "",
  };
}

export function ProjectConfigDialogView({ open, repoId, onClose }: ProjectConfigDialogViewProps) {
  const { t } = useTranslation();
  const projects = workspaceStore((state) => state.projects);
  const { updateProjectConfig, getDefaultWorktreeLocation, openEntryInExternalApp, openLocalFolderDialog } =
    useCommands();
  const repo = projects.find((item) => item.id === repoId);
  const [draft, setDraft] = useState<ProjectConfigDraft>(getDefaultDraft);
  const [iconAnchorEl, setIconAnchorEl] = useState<HTMLElement | null>(null);
  const updateProjectConfigMutation = useMutation({
    mutationFn: async (payload: {
      projectId: string;
      config: {
        name: string;
        worktreePath: string;
        contextEnabled?: boolean;
        icon?: string;
        color?: string;
        setupScript?: string;
        postScript?: string;
      };
    }) => {
      await updateProjectConfig(payload.projectId, payload.config);
    },
    onSuccess: () => {
      onClose();
    },
    onError: (error) => {
      console.error("Failed to update project config", error);
    },
  });
  const isSaving = updateProjectConfigMutation.isPending;
  const repoLocalPath = repo?.localPath ?? repo?.path ?? "";
  const repoGitUrl = repo?.gitUrl ?? repo?.repoUrl ?? "";
  const repoKey = repo?.key ?? repo?.repoKey ?? "";
  const trimmedRepoLocalPath = repoLocalPath.trim();

  useEffect(() => {
    if (!open || !repo) {
      return;
    }

    let cancelled = false;

    const loadDraft = async () => {
      let worktreePath = repo.worktreePath ?? "";
      if (!worktreePath) {
        try {
          worktreePath = await getDefaultWorktreeLocation();
        } catch {
          worktreePath = "";
        }
      }

      if (cancelled) {
        return;
      }

      setDraft({
        name: repo.name,
        worktreePath,
        contextEnabled: repo.contextEnabled ?? true,
        icon: findProjectIconOption(repo.icon ?? undefined)?.id ?? DEFAULT_PROJECT_ICON_ID,
        color: repo.color ?? DEFAULT_ICON_BG_COLOR,
        setupScript: repo.setupScript ?? "",
        postScript: repo.postScript ?? "",
      });
    };

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, [getDefaultWorktreeLocation, open, repo]);

  const handlePickWorktreeFolder = async () => {
    const selectedPath = await openLocalFolderDialog(draft.worktreePath || undefined);
    if (selectedPath) {
      setDraft((previous) => ({ ...previous, worktreePath: selectedPath }));
    }
  };

  /** Opens the repository local path in the host OS file manager. */
  const handleOpenRepoLocalPath = async () => {
    if (!trimmedRepoLocalPath) {
      return;
    }

    try {
      await openEntryInExternalApp({
        workspaceWorktreePath: trimmedRepoLocalPath,
        appId: SYSTEM_FILE_MANAGER_APP_ID,
      });
    } catch (error) {
      console.error("Failed to open repository local path in file manager", error);
    }
  };

  const handleSave = () => {
    if (!repo) {
      return;
    }

    const normalizedIconBgColor = /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : DEFAULT_ICON_BG_COLOR;

    updateProjectConfigMutation.mutate({
      projectId: repo.id,
      config: {
        name: draft.name.trim() || repo.name,
        worktreePath: draft.worktreePath.trim(),
        contextEnabled: draft.contextEnabled,
        icon: findProjectIconOption(draft.icon)?.id ?? DEFAULT_PROJECT_ICON_ID,
        color: normalizedIconBgColor,
        setupScript: draft.setupScript,
        postScript: draft.postScript,
      },
    });
  };

  return (
    <Dialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      disableEscapeKeyDown={isSaving}
    >
      <DialogTitle>{t("project.actions.config")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
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
                    onClick={() => void handleOpenRepoLocalPath()}
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
                title="Context stores repo-specific notes and guidance (briefs, decisions, references) outside the git repo so agents can reuse it across workspaces. This switch controls whether Yishan auto-creates the context link in new workspaces."
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
              Creates context symlink on new workspace creation.
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
                          onClick={handlePickWorktreeFolder}
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
                {ICON_BG_COLOR_PRESETS.map((color) => {
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
                            color: color,
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
          <Accordion disableGutters elevation={0} sx={{ bgcolor: "transparent" }}>
            <AccordionSummary expandIcon={<LuChevronDown size={18} />} sx={{ px: 0.5, minHeight: 36 }}>
              <Typography color="text.secondary">Advanced</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0.5, pb: 0.5 }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Setup script
                  </Typography>
                  <TextField
                    size="small"
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
                    size="small"
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
            </AccordionDetails>
          </Accordion>
        </Stack>
        <Popover
          open={Boolean(iconAnchorEl)}
          anchorEl={iconAnchorEl}
          onClose={() => setIconAnchorEl(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          <Box
            sx={{
              p: 1.25,
              display: "grid",
              gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
              gap: 1,
            }}
          >
            {PROJECT_ICON_OPTIONS.map((option) => {
              const selected = option.id === draft.icon;
              return (
                <IconButton
                  key={option.id}
                  size="small"
                  aria-label="Choose icon"
                  onClick={() => {
                    setDraft((previous) => ({
                      ...previous,
                      icon: option.id,
                    }));
                    setIconAnchorEl(null);
                  }}
                  sx={{
                    width: 32,
                    height: 32,
                    border: 1,
                    borderColor: selected ? "primary.main" : "divider",
                    bgcolor: selected ? "action.selected" : undefined,
                  }}
                >
                  <option.Icon size={16} />
                </IconButton>
              );
            })}
          </Box>
        </Popover>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!repo || isSaving}
          startIcon={isSaving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isSaving ? t("common.actions.saving", { defaultValue: "Saving..." }) : t("common.actions.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
