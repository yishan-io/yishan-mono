import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuCloud, LuFolderGit2, LuGitBranch, LuServer, LuSparkles } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { AgentIcon } from "../../../components/AgentIcon";
import { BranchDropdown, type BranchDropdownGroups } from "../../../components/BranchDropdown";
import { VirtualizedListbox } from "../../../components/VirtualizedListbox";
import { renderProjectIcon } from "../../../components/projectIcons";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "../../../helpers/agentSettings";
import type { AgentModelInfo } from "../../../commands/agentCommands";
import { getRendererPlatform } from "../../../helpers/platform";
import { resolveTargetBranchForCreate } from "../../../helpers/workspaceBranchNaming";
import { useCommands } from "../../../hooks/useCommands";
import { useDialogRegistration } from "../../../hooks/useDialogRegistration";
import { buildWorkspaceNavigationPath } from "../../../navigation/workspaceNavigation";
import { agentSettingsStore } from "../../../store/settings/agentSettingsStore";
import { sessionStore } from "../../../store/sessionStore";
import { workspaceSettingsStore } from "../../../store/settings/workspaceSettingsStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { compactSelectSx, resolveSourceBranchGroups } from "./createWorkspaceHelpers";
import { useCreateWorkspaceDialogState } from "./useCreateWorkspaceDialogState";

type CreateWorkspaceDialogViewProps = {
  open: boolean;
  projectId: string;
  mode?: "create" | "rename";
  workspaceId?: string;
  onClose: () => void;
};

/** Renders one create/rename workspace dialog that reuses shared name/branch form controls. */
export function CreateWorkspaceDialogView({
  open,
  projectId,
  mode = "create",
  workspaceId,
  onClose,
}: CreateWorkspaceDialogViewProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const organizationId = sessionStore((state) => state.selectedOrganizationId);
  const daemonId = sessionStore((state) => state.daemonId);
  const projects = workspaceStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
  const { createWorkspace, renameWorkspace, renameWorkspaceBranch, listGitBranches, listAgentModels } = useCommands();
  const prefixMode = workspaceSettingsStore((state) => state.prefixMode);
  const customPrefix = workspaceSettingsStore((state) => state.customPrefix);
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  useDialogRegistration(open);
  const isRenameMode = mode === "rename";
  const branchInputPlaceholder = isRenameMode
    ? t("workspace.rename.branchNameLabel")
    : t("workspace.create.branchNameLabel");
  const {
    selectedProjectId,
    setSelectedProjectId,
    sourceBranchOptions,
    sourceBranchGroups,
    sourceBranch,
    setSourceBranch,
    sourceBranchMenuAnchorEl,
    setSourceBranchMenuAnchorEl,
    isLoadingSourceBranches,
    name,
    setName,
    targetBranch,
    setTargetBranch,
    hasEditedTargetBranchRef,
    isCreatingWorkspace,
    setIsCreatingWorkspace,
    selectedNodeId,
    setSelectedNodeId,
    nodes,
    nodesError,
    resetDraftInputs,
    selectedProject,
    selectedWorkspace,
    defaultBranchPrefix,
    taskAgentKind,
    setTaskAgentKind,
    taskPrompt,
    setTaskPrompt,
    taskModel,
    setTaskModel,
  } = useCreateWorkspaceDialogState({
    open,
    projectId,
    workspaceId,
    isRenameMode,
    organizationId,
    daemonId,
    projects,
    workspaces,
    prefixMode,
    customPrefix,
    listGitBranches,
  });

  const [agentModels, setAgentModels] = useState<AgentModelInfo[]>([]);
  const [loadingAgentModels, setLoadingAgentModels] = useState(false);

  useEffect(() => {
    if (!taskAgentKind) {
      setAgentModels([]);
      return;
    }
    let cancelled = false;
    setLoadingAgentModels(true);
    listAgentModels(taskAgentKind)
      .then((result) => {
        if (!cancelled) {
          setAgentModels(result.models ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAgentModels(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taskAgentKind, listAgentModels]);

  /** Creates one workspace from manual inputs with prefix-aware branch fallback behavior. */
  const handleCreateWorkspace = async () => {
    if (isCreatingWorkspace) {
      return;
    }

    const normalizedName = name.trim();
    if (!selectedProjectId || !normalizedName) {
      return;
    }

    const normalizedTargetBranch = resolveTargetBranchForCreate({
      workspaceName: normalizedName,
      branchInput: targetBranch,
      branchPrefix: defaultBranchPrefix,
    });

    setIsCreatingWorkspace(true);
    try {
      const createdWorkspaceId = await createWorkspace({
        projectId: selectedProjectId,
        name: normalizedName,
        sourceBranch: sourceBranch.trim() || undefined,
        targetBranch: normalizedTargetBranch,
        nodeId: selectedNodeId || undefined,
        taskRun:
          taskAgentKind && taskPrompt.trim()
            ? {
                agentKind: taskAgentKind,
                prompt: taskPrompt.trim(),
                model: taskModel.trim() || undefined,
              }
            : undefined,
      });
      resetDraftInputs();
      onClose();
      if (createdWorkspaceId) {
        navigate(buildWorkspaceNavigationPath(createdWorkspaceId));
      }
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  /** Renames one workspace and/or branch from the current draft values. */
  const handleRenameWorkspace = async () => {
    if (isCreatingWorkspace || !selectedWorkspace) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedTargetBranch = targetBranch.trim();
    if (!normalizedName || !normalizedTargetBranch) {
      return;
    }

    const hasNameChanged = normalizedName !== selectedWorkspace.name.trim();
    const hasBranchChanged = normalizedTargetBranch !== selectedWorkspace.branch.trim();
    if (!hasNameChanged && !hasBranchChanged) {
      return;
    }

    setIsCreatingWorkspace(true);
    try {
      if (hasNameChanged) {
        renameWorkspace({
          repoId: selectedProjectId,
          workspaceId: selectedWorkspace.id,
          name: normalizedName,
        });
      }
      if (hasBranchChanged) {
        await renameWorkspaceBranch({
          repoId: selectedProjectId,
          workspaceId: selectedWorkspace.id,
          branch: normalizedTargetBranch,
        });
      }
      onClose();
    } catch (error) {
      console.error("Failed to rename workspace from dialog", error);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const canCreateWorkspace =
    Boolean(selectedProjectId) &&
    !isLoadingSourceBranches &&
    !isCreatingWorkspace &&
    Boolean(name.trim()) &&
    (!organizationId || Boolean(selectedNodeId)) &&
    Boolean(sourceBranch.trim()) &&
    Boolean(targetBranch.trim());
  const hasRenameChanges =
    Boolean(selectedWorkspace) &&
    (name.trim() !== (selectedWorkspace?.name.trim() ?? "") ||
      targetBranch.trim() !== (selectedWorkspace?.branch.trim() ?? ""));
  const canRenameWorkspace =
    Boolean(selectedWorkspace) &&
    !isCreatingWorkspace &&
    Boolean(name.trim()) &&
    Boolean(targetBranch.trim()) &&
    hasRenameChanges;
  const dialogTitle = isRenameMode ? t("workspace.rename.title") : t("workspace.create.title");
  const submitLabel = isRenameMode ? t("workspace.actions.rename") : t("workspace.actions.create");
  const canSubmitWorkspace = isRenameMode ? canRenameWorkspace : canCreateWorkspace;
  const submitShortcutLabel = getRendererPlatform() === "darwin" ? "⌘↵" : "Ctrl+↵";
  const sourceBranchSelectValue = sourceBranchOptions.includes(sourceBranch) ? sourceBranch : "";
  const isSourceBranchMenuOpen = Boolean(sourceBranchMenuAnchorEl);
  const isSelectedSourceBranchWorktree = sourceBranchGroups.worktreeBranches.includes(sourceBranchSelectValue);

  /** Submits the dialog form when Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux) is pressed. */
  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmitWorkspace) {
      event.preventDefault();
      void (isRenameMode ? handleRenameWorkspace() : handleCreateWorkspace());
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onKeyDown={handleDialogKeyDown}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
          },
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>{dialogTitle}</DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Project
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                sx={compactSelectSx}
                disabled={isRenameMode}
                slotProps={{
                  select: {
                    displayEmpty: true,
                    autoWidth: false,
                    MenuProps: {
                      slotProps: {
                        paper: {
                          sx: {
                            width: "250px !important",
                            minWidth: "250px !important",
                            maxWidth: "250px !important",
                          },
                        },
                        list: {
                          sx: {
                            width: "250px",
                          },
                        },
                      },
                      PaperProps: {
                        sx: {
                          width: "250px !important",
                          minWidth: "250px !important",
                          maxWidth: "250px !important",
                        },
                      },
                    },
                    renderValue: (value) => {
                      const selectedValue = typeof value === "string" ? value : "";
                      const selectedValueRepo = projects.find((project) => project.id === selectedValue);
                      const repoName = selectedValueRepo?.name ?? t("project.unknown");

                      return (
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Avatar
                            variant="rounded"
                            sx={{
                              width: 20,
                              height: 20,
                              bgcolor: selectedValueRepo?.color ?? theme.palette.primary.main,
                              color: theme.palette.getContrastText(
                                selectedValueRepo?.color ?? theme.palette.primary.main,
                              ),
                            }}
                          >
                            {renderProjectIcon(selectedValueRepo?.icon ?? undefined, 12)}
                          </Avatar>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {repoName}
                          </Typography>
                        </Stack>
                      );
                    },
                  },
                }}
              >
                {projects.map((repo) => (
                  <MenuItem key={repo.id} value={repo.id}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Avatar
                        variant="rounded"
                        sx={{
                          width: 20,
                          height: 20,
                          bgcolor: repo.color ?? theme.palette.primary.main,
                          color: theme.palette.getContrastText(repo.color ?? theme.palette.primary.main),
                        }}
                      >
                        {renderProjectIcon(repo.icon ?? undefined, 12)}
                      </Avatar>
                      <Typography variant="body2">{repo.name}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Source branch
              </Typography>
              <TextField
                size="small"
                fullWidth
                value={sourceBranchSelectValue}
                onClick={(event) => {
                  if (isRenameMode || !selectedProjectId || sourceBranchOptions.length === 0) {
                    return;
                  }
                  setSourceBranchMenuAnchorEl(event.currentTarget);
                }}
                sx={compactSelectSx}
                InputProps={{
                  readOnly: true,
                  startAdornment: (
                    <InputAdornment position="start" sx={{ mr: 0.75 }}>
                      {isSelectedSourceBranchWorktree ? (
                        <LuFolderGit2 size={14} color="currentColor" />
                      ) : (
                        <LuGitBranch size={14} color="currentColor" />
                      )}
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end" sx={{ ml: 0.5, color: "text.secondary" }}>
                      {isLoadingSourceBranches ? <CircularProgress size={14} /> : <LuChevronDown size={16} />}
                    </InputAdornment>
                  ),
                }}
                placeholder="Source branch"
                disabled={isRenameMode || !selectedProjectId || sourceBranchOptions.length === 0}
              />
              <Popover
                open={isSourceBranchMenuOpen}
                anchorEl={sourceBranchMenuAnchorEl}
                onClose={() => setSourceBranchMenuAnchorEl(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                disableRestoreFocus
                slotProps={{
                  paper: {
                    sx: {
                      minWidth: 250,
                      maxWidth: 350,
                      mt: 0.5,
                    },
                  },
                }}
              >
                {isLoadingSourceBranches ? (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 3, px: 2, gap: 1 }}>
                    <CircularProgress size={14} />
                    <Typography variant="caption" color="text.secondary">
                      Loading branches\u2026
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <BranchDropdown
                      groups={sourceBranchGroups}
                      selectedValue={sourceBranchSelectValue}
                      onSelect={(value) => {
                        setSourceBranch(value);
                        setSourceBranchMenuAnchorEl(null);
                      }}
                      localLabel="Local"
                      branchesLabel="Branches"
                      worktreesLabel="Worktrees"
                      remoteLabel="Remote"
                      emptyLocalLabel="No local branches"
                      emptyWorktreeLabel="No worktree branches"
                      emptyRemoteLabel="No remote branches"
                    />
                  </>
                )}
              </Popover>
            </Box>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                {t("workspace.create.nameLabel")}
              </Typography>
              <TextField
                size="small"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("workspace.create.namePlaceholder")}
                fullWidth
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                {t("workspace.create.branchLabel")}
              </Typography>
              <TextField
                size="small"
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
                onChange={(event) => {
                  setTargetBranch(event.target.value);
                  hasEditedTargetBranchRef.current = true;
                }}
              />
            </Box>
          </Stack>

          {!isRenameMode ? (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Run on node
              </Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={selectedNodeId}
                onChange={(event) => setSelectedNodeId(event.target.value)}
                sx={compactSelectSx}
                disabled={isCreatingWorkspace || nodes.length === 0}
                slotProps={{
                  select: {
                    renderValue: (value) => {
                      const selectedValue = typeof value === "string" ? value : "";
                      const selectedNode = nodes.find((node) => node.id === selectedValue);
                      return (
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                            {selectedNode?.scope === "shared" ? <LuCloud size={14} /> : <LuServer size={14} />}
                          </Box>
                          <Box
                            component="span"
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: selectedNode?.isOnline ? "success.main" : "text.disabled",
                            }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {selectedNode?.name ?? "Select node"}
                          </Typography>
                        </Stack>
                      );
                    },
                  },
                }}
              >
                {nodes.map((node) => (
                    <MenuItem key={node.id} value={node.id} disabled={!node.canUse || !node.isOnline}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                          {node.scope === "shared" ? <LuCloud size={14} /> : <LuServer size={14} />}
                        </Box>
                        <Box
                          component="span"
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: node.isOnline ? "success.main" : "text.disabled",
                          }}
                        />
                        <Typography variant="body2">{node.name}</Typography>
                      </Stack>
                    </MenuItem>
                  ))}
              </TextField>
              {nodesError ? (
                <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                  {nodesError}
                </Typography>
              ) : null}
            </Box>
          ) : null}

          {!isRenameMode ? (
            <Box>
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
                <LuSparkles size={14} />
                <Typography variant="caption" color="text.secondary">
                  Task run (optional)
                </Typography>
              </Stack>
              <Stack spacing={1.5}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={taskAgentKind}
                  onChange={(event) =>
                    setTaskAgentKind(event.target.value as DesktopAgentKind | "")
                  }
                  sx={compactSelectSx}
                  disabled={isCreatingWorkspace}
                  slotProps={{
                    select: {
                      displayEmpty: true,
                      renderValue: (value) => {
                        const selectedKind = value as DesktopAgentKind | "";
                        if (!selectedKind) {
                          return (
                            <Typography variant="body2" color="text.secondary">
                              Agent
                            </Typography>
                          );
                        }
                        return (
                          <Stack direction="row" alignItems="center" gap={1}>
                            <AgentIcon agentKind={selectedKind} context="settingsRow" decorative />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {selectedKind}
                            </Typography>
                          </Stack>
                        );
                      },
                    },
                  }}
                >
                  {SUPPORTED_DESKTOP_AGENT_KINDS.filter((kind) => inUseByAgentKind[kind]).map((kind) => (
                    <MenuItem key={kind} value={kind}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <AgentIcon agentKind={kind} context="settingsRow" decorative />
                        <Typography variant="body2">
                          {t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[kind])}
                        </Typography>
                      </Stack>
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  fullWidth
                  value={taskPrompt}
                  onChange={(event) => setTaskPrompt(event.target.value)}
                  placeholder="Task description / prompt"
                  disabled={isCreatingWorkspace}
                  multiline
                  minRows={2}
                  maxRows={4}
                />
                {taskAgentKind ? (
                  <Autocomplete
                    size="small"
                    fullWidth
                    freeSolo
                    ListboxComponent={VirtualizedListbox}
                    options={agentModels}
                    getOptionLabel={(option) => (typeof option === "string" ? option : option.name)}
                    value={taskModel || null}
                    onChange={(_event, value) =>
                      setTaskModel(typeof value === "string" ? value : (value?.id ?? ""))
                    }
                    onInputChange={(_event, value) => setTaskModel(value)}
                    loading={loadingAgentModels}
                    disabled={isCreatingWorkspace}
                    isOptionEqualToValue={(option, value) => option.id === (typeof value === "string" ? value : value.id)}
                    renderInput={(params) => (
                      <TextField {...params} placeholder="Model (optional)" />
                    )}
                    renderOption={(props, option) => {
                      const { key, ...rest } = props;
                      return (
                        <li key={key} {...rest}>
                          <Typography variant="body2">{option.name}</Typography>
                        </li>
                      );
                    }}
                  />
                ) : null}
              </Stack>
            </Box>
          ) : null}

          <Button
            size="medium"
            variant="contained"
            onClick={() => void (isRenameMode ? handleRenameWorkspace() : handleCreateWorkspace())}
            disabled={!canSubmitWorkspace}
            sx={{ borderRadius: 2.5, textTransform: "none", py: 1, position: "relative", gap: 1 }}
          >
            {isCreatingWorkspace ? <CircularProgress size={16} color="inherit" /> : null}
            <Typography component="span" sx={{ mx: "auto", fontWeight: 500 }}>
              {submitLabel}
            </Typography>
            <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
              {submitShortcutLabel}
            </Typography>
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
