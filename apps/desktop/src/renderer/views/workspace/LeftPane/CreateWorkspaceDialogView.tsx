import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuGitBranch } from "react-icons/lu";
import {
  resolveSourceBranchState,
  resolveTargetBranchForCreate,
  suggestTargetBranchName,
} from "../../../helpers/workspaceBranchNaming";
import { renderProjectIcon } from "../../../components/projectIcons";
import { useCommands } from "../../../hooks/useCommands";
import { gitBranchStore, resolveGitBranchPrefix } from "../../../store/gitBranchStore";
import { workspaceStore } from "../../../store/workspaceStore";

type CreateWorkspaceDialogViewProps = {
  open: boolean;
  repoId: string;
  mode?: "create" | "rename";
  workspaceId?: string;
  onClose: () => void;
};

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
  repoId,
  mode = "create",
  workspaceId,
  onClose,
}: CreateWorkspaceDialogViewProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const repos = workspaceStore((state) => state.repos);
  const workspaces = workspaceStore((state) => state.workspaces);
  const { createWorkspace, renameWorkspace, renameWorkspaceBranch, getGitAuthorName, listGitBranches } = useCommands();
  const prefixMode = gitBranchStore((state) => state.prefixMode);
  const customPrefix = gitBranchStore((state) => state.customPrefix);
  const isRenameMode = mode === "rename";
  const branchInputPlaceholder = isRenameMode
    ? t("workspace.rename.branchNameLabel")
    : t("workspace.create.branchNameLabel");
  const [selectedRepoId, setSelectedRepoId] = useState(() =>
    repos.some((repo) => repo.id === repoId) ? repoId : (repos[0]?.id ?? ""),
  );
  const [sourceBranchOptions, setSourceBranchOptions] = useState<string[]>([]);
  const [sourceBranch, setSourceBranch] = useState("");
  const [isLoadingSourceBranches, setIsLoadingSourceBranches] = useState(false);
  const [name, setName] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const hasEditedTargetBranchRef = useRef(false);
  const hasSyncedRepoIdForOpenRef = useRef(false);
  const [resolvedGitUserName, setResolvedGitUserName] = useState("");
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
    setSelectedRepoId((currentRepoId) => {
      if (repos.some((repo) => repo.id === repoId)) {
        return repoId;
      }
      if (repos.some((repo) => repo.id === currentRepoId)) {
        return currentRepoId;
      }
      return repos[0]?.id ?? "";
    });
  }, [open, repoId, repos]);

  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId);
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId && workspace.repoId === selectedRepoId && workspace.kind !== "local",
  );
  const selectedRepoBranchListPath =
    selectedRepo?.localPath?.trim() || selectedRepo?.path.trim() || selectedRepo?.worktreePath.trim() || "";
  const resolvedPrefix = resolveGitBranchPrefix({
    prefixMode,
    customPrefix,
    gitUserName: resolvedGitUserName,
  });
  const defaultBranchPrefix = resolvedPrefix ? `${resolvedPrefix}/` : "";

  useEffect(() => {
    if (!open || !selectedRepoBranchListPath || prefixMode !== "user") {
      setResolvedGitUserName("");
      return;
    }
    if (isRenameMode) {
      return;
    }

    let isCancelled = false;
    void (async () => {
      try {
        const authorName = await getGitAuthorName({
          workspaceWorktreePath: selectedRepoBranchListPath,
        });
        if (isCancelled) {
          return;
        }
        setResolvedGitUserName(authorName?.trim() || "");
      } catch {
        if (!isCancelled) {
          setResolvedGitUserName("");
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [getGitAuthorName, isRenameMode, open, prefixMode, selectedRepoBranchListPath]);

  useEffect(() => {
    if (!open || hasEditedTargetBranchRef.current || isRenameMode) {
      return;
    }
    const nextTargetBranch = suggestTargetBranchName(name, defaultBranchPrefix);
    setTargetBranch((currentValue) => (currentValue === nextTargetBranch ? currentValue : nextTargetBranch));
  }, [defaultBranchPrefix, isRenameMode, name, open]);

  useEffect(() => {
    if (!open || !selectedRepoBranchListPath || isRenameMode) {
      const renameSourceBranch = selectedWorkspace?.sourceBranch?.trim() ?? "";
      if (isRenameMode && open) {
        setSourceBranchOptions(renameSourceBranch ? [renameSourceBranch] : []);
        setSourceBranch(renameSourceBranch);
        setIsLoadingSourceBranches(false);
        return;
      }
      setSourceBranchOptions([]);
      setSourceBranch("");
      setIsLoadingSourceBranches(false);
      return;
    }

    let isCancelled = false;

    /** Applies one branch list into selector options while preserving manual current selection. */
    const applySourceBranchState = (branches: string[]) => {
      const nextSourceBranchState = resolveSourceBranchState(branches, selectedRepo?.defaultBranch ?? "");
      setSourceBranchOptions(nextSourceBranchState.options);
      setSourceBranch((currentValue) =>
        currentValue && nextSourceBranchState.options.includes(currentValue)
          ? currentValue
          : nextSourceBranchState.preferred,
      );
    };

    const loadSourceBranches = async () => {
      setIsLoadingSourceBranches(true);
      try {
        const result = await listGitBranches({ workspaceWorktreePath: selectedRepoBranchListPath });
        if (isCancelled) {
          return;
        }

        applySourceBranchState(result.branches ?? []);
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
    selectedRepo?.defaultBranch,
    selectedRepoBranchListPath,
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
    if (!selectedRepoId || !normalizedName) {
      return;
    }

    const normalizedTargetBranch = resolveTargetBranchForCreate({
      workspaceName: normalizedName,
      branchInput: targetBranch,
      branchPrefix: defaultBranchPrefix,
    });

    setIsCreatingWorkspace(true);
    try {
      await createWorkspace({
        repoId: selectedRepoId,
        name: normalizedName,
        sourceBranch: sourceBranch.trim() || undefined,
        targetBranch: normalizedTargetBranch,
      });
      resetDraftInputs();
      onClose();
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
          repoId: selectedRepoId,
          workspaceId: selectedWorkspace.id,
          name: normalizedName,
        });
      }
      if (hasBranchChanged) {
        await renameWorkspaceBranch({
          repoId: selectedRepoId,
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
    Boolean(selectedRepoId) && !isLoadingSourceBranches && !isCreatingWorkspace && Boolean(name.trim());
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
              <TextField
                select
                size="small"
                fullWidth
                value={selectedRepoId}
                onChange={(event) => setSelectedRepoId(event.target.value)}
                sx={compactSelectSx}
                disabled={isRenameMode}
                slotProps={{
                  select: {
                    displayEmpty: true,
                    renderValue: (value) => {
                      const selectedValue = typeof value === "string" ? value : "";
                      const selectedValueRepo = repos.find((repo) => repo.id === selectedValue);
                      const repoName = selectedValueRepo?.name ?? t("project.unknown");

                      return (
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Avatar
                            variant="rounded"
                            sx={{
                              width: 20,
                              height: 20,
                              bgcolor: selectedValueRepo?.iconBgColor ?? theme.palette.primary.main,
                              color: theme.palette.getContrastText(
                                selectedValueRepo?.iconBgColor ?? theme.palette.primary.main,
                              ),
                            }}
                          >
                            {renderProjectIcon(selectedValueRepo?.icon, 12)}
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
                {repos.map((repo) => (
                  <MenuItem key={repo.id} value={repo.id}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Avatar
                        variant="rounded"
                        sx={{
                          width: 20,
                          height: 20,
                          bgcolor: repo.iconBgColor ?? theme.palette.primary.main,
                          color: theme.palette.getContrastText(repo.iconBgColor ?? theme.palette.primary.main),
                        }}
                      >
                        {renderProjectIcon(repo.icon, 12)}
                      </Avatar>
                      <Typography variant="body2">{repo.name}</Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <Box sx={{ flex: 1 }}>
              <TextField
                select
                size="small"
                fullWidth
                value={sourceBranch}
                onChange={(event) => setSourceBranch(event.target.value)}
                sx={compactSelectSx}
                slotProps={{
                  select: {
                    displayEmpty: true,
                    renderValue: (value) => {
                      const selectedValue = typeof value === "string" ? value : "";

                      return (
                        <Stack direction="row" alignItems="center" gap={1}>
                          <LuGitBranch size={14} color="currentColor" />
                          <Typography variant="body2" sx={{ fontWeight: 500, letterSpacing: 0.1 }}>
                            {selectedValue || "Source branch"}
                          </Typography>
                        </Stack>
                      );
                    },
                  },
                }}
                disabled={
                  isRenameMode || !selectedRepoId || isLoadingSourceBranches || sourceBranchOptions.length === 0
                }
              >
                {sourceBranchOptions.map((branchOption) => (
                  <MenuItem key={branchOption} value={branchOption}>
                    {branchOption}
                  </MenuItem>
                ))}
              </TextField>
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
            sx={{ borderRadius: 2.5, textTransform: "none", py: 1, position: "relative" }}
          >
            <Typography component="span" sx={{ mx: "auto", fontWeight: 500 }}>
              {submitLabel}
            </Typography>
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
