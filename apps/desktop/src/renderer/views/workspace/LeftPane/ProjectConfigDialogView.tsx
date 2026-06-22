import {
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
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuCircleHelp, LuExternalLink, LuFolderOpen, LuPlus, LuTrash2 } from "react-icons/lu";
import { PROJECT_ICON_OPTIONS, renderProjectIcon } from "../../../components/projectIcons";
import { useCommands } from "../../../hooks/useCommands";
import { useDialogRegistration } from "../../../hooks/useDialogRegistration";
import { workspaceStore } from "../../../store/workspaceStore";
import { useProjectConfigActions } from "./useProjectConfigActions";
import { createProjectConfigCommandDraft, useProjectConfigFormState } from "./useProjectConfigFormState";

type ProjectConfigDialogViewProps = {
  open: boolean;
  repoId: string;
  onClose: () => void;
};

const ICON_BG_COLOR_PRESETS = ["#1E66F5", "#0F766E", "#CA8A04", "#DC2626", "#7C3AED", "#DB2777", "#0891B2"];

export function ProjectConfigDialogView({ open, repoId, onClose }: ProjectConfigDialogViewProps) {
  const { t } = useTranslation();
  const rawProjects = workspaceStore((state) => state.projects);
  const projects = useMemo(
    () =>
      rawProjects.map((project) => ({
        ...project,
        localPath: project.localPath ?? undefined,
        repoUrl: project.repoUrl ?? undefined,
        repoKey: project.repoKey ?? undefined,
        worktreePath: project.worktreePath ?? undefined,
        icon: project.icon ?? undefined,
        color: project.color ?? undefined,
        setupScript: project.setupScript ?? undefined,
        postScript: project.postScript ?? undefined,
      })),
    [rawProjects],
  );
  const { getDefaultWorktreeLocation } = useCommands();
  const {
    repo,
    draft,
    setDraft,
    iconAnchorEl,
    setIconAnchorEl,
    repoLocalPath,
    repoGitUrl,
    repoKey,
    trimmedRepoLocalPath,
  } = useProjectConfigFormState({ open, repoId, projects, getDefaultWorktreeLocation });
  const { isSaving, handlePickWorktreeFolder, handleOpenRepoLocalPath, handleSave } = useProjectConfigActions({
    repo,
    draft,
    setDraft,
    trimmedRepoLocalPath,
    onClose,
  });
  useDialogRegistration(open);
  const [activeSection, setActiveSection] = useState<"general" | "scripts" | "commands">("general");

  const SECTION_ITEMS = [
    {
      id: "general" as const,
      label: t("project.config.sections.general", { defaultValue: "General" }),
    },
    {
      id: "scripts" as const,
      label: t("project.config.sections.scripts", { defaultValue: "Scripts" }),
    },
    {
      id: "commands" as const,
      label: t("project.config.sections.quickCommands", { defaultValue: "Quick commands" }),
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={isSaving ? undefined : onClose}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown={isSaving}
    >
      <DialogTitle>{t("project.actions.config")}</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Stack direction="row" sx={{ minHeight: 420 }}>
          <Box
            sx={{
              width: 220,
              borderRight: 1,
              borderColor: "divider",
              flexShrink: 0,
              py: 1,
            }}
          >
            <List dense>
              {SECTION_ITEMS.map((section) => (
                <ListItemButton
                  key={section.id}
                  selected={activeSection === section.id}
                  onClick={() => setActiveSection(section.id)}
                  sx={{ borderRadius: 1, mx: 0.5 }}
                >
                  <ListItemText primary={section.label} slotProps={{ primary: { variant: "body2" } }} />
                </ListItemButton>
              ))}
            </List>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
            {activeSection === "general" && (
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
              </Stack>
            )}
            {activeSection === "scripts" && (
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
            )}
            {activeSection === "commands" && (
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Project commands
                </Typography>
                <Stack spacing={1}>
                  {draft.commands.map((item, index) => (
                    <Stack key={item.id} direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        value={item.name}
                        disabled={isSaving}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            commands: previous.commands.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, name: event.target.value } : entry,
                            ),
                          }))
                        }
                        placeholder="Name"
                        sx={{ width: 180 }}
                      />
                      <TextField
                        size="small"
                        value={item.command}
                        disabled={isSaving}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            commands: previous.commands.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, command: event.target.value } : entry,
                            ),
                          }))
                        }
                        placeholder="Command line"
                        fullWidth
                      />
                      <IconButton
                        size="small"
                        aria-label="Remove command"
                        disabled={isSaving}
                        onClick={() =>
                          setDraft((previous) => ({
                            ...previous,
                            commands: previous.commands.filter((_, entryIndex) => entryIndex !== index),
                          }))
                        }
                      >
                        <LuTrash2 size={14} />
                      </IconButton>
                    </Stack>
                  ))}
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={isSaving}
                    startIcon={<LuPlus size={14} />}
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        commands: [...previous.commands, createProjectConfigCommandDraft("", "")],
                      }))
                    }
                    sx={{ alignSelf: "flex-start", textTransform: "none" }}
                  >
                    Add command
                  </Button>
                </Stack>
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
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
