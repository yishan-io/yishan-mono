import {
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
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuChevronDown, LuFolderGit2, LuGitBranch } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { BranchDropdown, type BranchDropdownGroups } from "../../../components/BranchDropdown";
import { renderProjectIcon } from "../../../components/projectIcons";
import { getRendererPlatform } from "../../../helpers/platform";
import {
  resolveSourceBranchState,
  resolveTargetBranchForCreate,
  suggestTargetBranchName,
} from "../../../helpers/workspaceBranchNaming";
import { useCommands } from "../../../hooks/useCommands";
import { useDialogRegistration } from "../../../hooks/useDialogRegistration";
import { useGitAuthorName } from "../../../hooks/useGitAuthorName";
import { buildWorkspaceNavigationPath } from "../../../navigation/workspaceNavigation";
import { gitBranchStore, resolveGitBranchPrefix } from "../../../store/gitBranchStore";
import { workspaceStore } from "../../../store/workspaceStore";

type CreateWorkspaceDialogViewProps = {
  open: boolean;
  projectId: string;
  mode?: "create" | "rename";
  workspaceId?: string;
  onClose: () => void;
};

function toUniqueSorted(values: string[]): string[] {
  const normalizedValues = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  const preferredBranchOrder = new Map<string, number>([
    ["main", 0],
    ["master", 1],
    ["origin/main", 0],
    ["origin/master", 1],
  ]);

  return normalizedValues.sort((left, right) => {
    const leftRank = preferredBranchOrder.get(left);
    const rightRank = preferredBranchOrder.get(right);
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    }

    return left.localeCompare(right);
  });
}

function resolveSourceBranchGroups(input: {
  branches: string[];
  localBranches?: string[];
  remoteBranches?: string[];
  worktreeBranches?: string[];
}): BranchDropdownGroups {
  const hasExplicitGroups = Boolean(input.localBranches || input.remoteBranches || input.worktreeBranches);
  if (hasExplicitGroups) {
    return {
      localBranches: toUniqueSorted(input.localBranches ?? []),
      worktreeBranches: toUniqueSorted(input.worktreeBranches ?? []),
      remoteBranches: toUniqueSorted(input.remoteBranches ?? []),
    };
  }

  const localBranches: string[] = [];
  const worktreeBranches: string[] = [];
  const remoteBranches: string[] = [];

  for (const branch of input.branches) {
    const normalizedBranch = branch.trim();
    if (!normalizedBranch) {
      continue;
    }
    if (normalizedBranch.includes("/") && !normalizedBranch.startsWith("origin/")) {
      worktreeBranches.push(normalizedBranch);
      continue;
    }
    if (normalizedBranch.startsWith("origin/")) {
      remoteBranches.push(normalizedBranch);
      continue;
    }
    localBranches.push(normalizedBranch);
  }

  return {
    localBranches: toUniqueSorted(localBranches),
    worktreeBranches: toUniqueSorted(worktreeBranches),
    remoteBranches: toUniqueSorted(remoteBranches),
  };
}

const compactSelectSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: 2.5,
    backgroundColor: "action.hover",
    minHeight: 36,
    "& fieldset": {
      borderColor: "transparent",
    },
    "&:hover fieldset": {
      borderColor: "transparent",
    },
    "&.Mui-focused fieldset": {
      borderColor: "divider",
    },
  },
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    py: 0.5,
    pr: 4,
  },
  "& .MuiSelect-icon": {
    right: 10,
    color: "text.secondary",
    fontSize: 18,
  },
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
  const projects = workspaceStore((state) => state.projects);
  const workspaces = workspaceStore((state) => state.workspaces);
  const { createWorkspace, renameWorkspace, renameWorkspaceBranch, listGitBranches } = useCommands();
  const prefixMode = gitBranchStore((state) => state.prefixMode);
  const customPrefix = gitBranchStore((state) => state.customPrefix);
  useDialogRegistration(open);
  const isRenameMode = mode === "rename";
  const branchInputPlaceholder = isRenameMode
    ? t("workspace.rename.branchNameLabel")
    : t("workspace.create.branchNameLabel");
  const [selectedProjectId, setSelectedProjectId] = useState(() =>
    projects.some((project) => project.id === projectId) ? projectId : (projects[0]?.id ?? ""),
  );
  const [sourceBranchOptions, setSourceBranchOptions] = useState<string[]>([]);
  const [sourceBranchGroups, setSourceBranchGroups] = useState<BranchDropdownGroups>({
    localBranches: [],
    worktreeBranches: [],
    remoteBranches: [],
  });
  const [sourceBranch, setSourceBranch] = useState("");
  const [sourceBranchMenuAnchorEl, setSourceBranchMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [isLoadingSourceBranches, setIsLoadingSourceBranches] = useState(false);
  const [name, setName] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const hasEditedTargetBranchRef = useRef(false);
  const hasSyncedRepoIdForOpenRef = useRef(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  /** Clears dialog draft values so reopening starts from a clean form. */
  const resetDraftInputs = () => {
    setName("");
    setTargetBranch("");
    hasEditedTargetBranchRef.current = false;
  };

  useEffect(() => {
    if (!open) {
      hasSyncedRepoIdForOpenRef.current = false;
      return;
    }
    if (hasSyncedRepoIdForOpenRef.current) {
      return;
    }
    hasSyncedRepoIdForOpenRef.current = true;
    hasEditedTargetBranchRef.current = false;
    setSelectedProjectId((currentProjectId) => {
      if (projects.some((project) => project.id === projectId)) {
        return projectId;
      }
      if (projects.some((project) => project.id === currentProjectId)) {
        return currentProjectId;
      }
      return projects[0]?.id ?? "";
    });
  }, [open, projectId, projects]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId && workspace.repoId === selectedProjectId && workspace.kind !== "local",
  );
  const selectedProjectBranchListPath =
    selectedProject?.localPath?.trim() || selectedProject?.path?.trim() || selectedProject?.worktreePath?.trim() || "";
  const gitAuthorNamePath = open && !isRenameMode && prefixMode === "user" ? selectedProjectBranchListPath : "";
  const resolvedGitUserName = useGitAuthorName(gitAuthorNamePath);
  const resolvedPrefix = resolveGitBranchPrefix({
    prefixMode,
    customPrefix,
    gitUserName: resolvedGitUserName,
  });
  const defaultBranchPrefix = resolvedPrefix ? `${resolvedPrefix}/` : "";

  useEffect(() => {
    if (!open || hasEditedTargetBranchRef.current || isRenameMode) {
      return;
    }
    const nextTargetBranch = suggestTargetBranchName(name, defaultBranchPrefix);
    setTargetBranch((currentValue) => (currentValue === nextTargetBranch ? currentValue : nextTargetBranch));
  }, [defaultBranchPrefix, isRenameMode, name, open]);

  useEffect(() => {
    if (!open || !selectedProjectBranchListPath || isRenameMode) {
      const renameSourceBranch = selectedWorkspace?.sourceBranch?.trim() ?? "";
      if (isRenameMode && open) {
        setSourceBranchOptions(renameSourceBranch ? [renameSourceBranch] : []);
        setSourceBranchGroups({
          localBranches: renameSourceBranch ? [renameSourceBranch] : [],
          worktreeBranches: [],
          remoteBranches: [],
        });
        setSourceBranch(renameSourceBranch);
        setIsLoadingSourceBranches(false);
        return;
      }
      setSourceBranchOptions([]);
      setSourceBranchGroups({
        localBranches: [],
        worktreeBranches: [],
        remoteBranches: [],
      });
      setSourceBranch("");
      setIsLoadingSourceBranches(false);
      return;
    }

    let isCancelled = false;

    /** Applies one branch list into selector options while preserving manual current selection. */
    const applySourceBranchState = (branches: string[], nextGroups?: BranchDropdownGroups) => {
      const nextSourceBranchState = resolveSourceBranchState(branches, selectedProject?.defaultBranch ?? "");
      const resolvedGroups =
        nextGroups ??
        resolveSourceBranchGroups({
          branches: nextSourceBranchState.options,
        });
      const remotePreferredBranch =
        resolvedGroups.remoteBranches.find((branch) => branch === "origin/main" || branch === "origin/master") ?? "";
      const preferredBranch = remotePreferredBranch || nextSourceBranchState.preferred;
      setSourceBranchOptions(nextSourceBranchState.options);
      setSourceBranchGroups(resolvedGroups);
      setSourceBranch((currentValue) =>
        currentValue && nextSourceBranchState.options.includes(currentValue) ? currentValue : preferredBranch,
      );
    };

    const loadSourceBranches = async () => {
      setIsLoadingSourceBranches(true);
      try {
        const result = await listGitBranches({ workspaceWorktreePath: selectedProjectBranchListPath });
        if (isCancelled) {
          return;
        }

        const nextGroups = resolveSourceBranchGroups({
          branches: result.branches ?? [],
          localBranches: result.localBranches,
          remoteBranches: result.remoteBranches,
          worktreeBranches: result.worktreeBranches,
        });
        applySourceBranchState(result.branches ?? [], nextGroups);
      } catch {
        if (isCancelled) {
          return;
        }
        applySourceBranchState([]);
      } finally {
        if (!isCancelled) {
          setIsLoadingSourceBranches(false);
        }
      }
    };

    void loadSourceBranches();

    return () => {
      isCancelled = true;
    };
  }, [
    isRenameMode,
    listGitBranches,
    open,
    selectedProject?.defaultBranch,
    selectedProjectBranchListPath,
    selectedWorkspace?.sourceBranch,
  ]);

  useEffect(() => {
    if (!open || !isRenameMode) {
      return;
    }

    setName(selectedWorkspace?.name ?? "");
    setTargetBranch(selectedWorkspace?.branch ?? "");
  }, [isRenameMode, open, selectedWorkspace?.branch, selectedWorkspace?.name]);

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
