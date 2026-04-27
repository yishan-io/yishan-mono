import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuFolder, LuFolderOpen, LuGlobe } from "react-icons/lu";
import { useCommands } from "../../../hooks/useCommands";

type CreateProjectDialogViewProps = {
  open: boolean;
  onClose: () => void;
};

type RepoDraft = {
  name: string;
  key?: string;
  source: "local" | "remote";
  path?: string;
  gitUrl?: string;
  keyEdited: boolean;
};

/** Converts one local path or URL into a default repository key candidate. */
function deriveDefaultRepoKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\\+$/g, "").replace(/\/+$/g, "");
  const segment =
    normalized
      .split(/[\\/]/)
      .filter((part) => part.length > 0)
      .at(-1) ?? "";
  const withoutGitSuffix = segment.replace(/\.git$/i, "");
  return withoutGitSuffix
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Returns true when one repository key satisfies the frontend naming constraints. */
function isValidRepoKey(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value);
}

const defaultDraft: RepoDraft = { name: "", key: "", source: "local", path: "", gitUrl: "", keyEdited: false };

export function CreateProjectDialogView({ open, onClose }: CreateProjectDialogViewProps) {
  const { t } = useTranslation();
  const { createProject, openLocalFolderDialog } = useCommands();
  const [repoDraft, setRepoDraft] = useState<RepoDraft>(defaultDraft);

  const createProjectMutation = useMutation({
    mutationFn: async (input: Omit<RepoDraft, "keyEdited">) => {
      await createProject(input);
    },
    onSuccess: () => {
      setRepoDraft(defaultDraft);
      onClose();
    },
  });

  const isCreating = createProjectMutation.isPending;

  const resetAndClose = () => {
    if (isCreating) {
      return;
    }
    setRepoDraft(defaultDraft);
    onClose();
  };

  const normalizedKey = repoDraft.key.trim();
  const isKeyInvalid = normalizedKey.length > 0 && !isValidRepoKey(normalizedKey);

  const isCreateDisabled =
    repoDraft.name.trim().length === 0 ||
    normalizedKey.length === 0 ||
    isKeyInvalid ||
    (repoDraft.source === "local" ? repoDraft.path.trim().length === 0 : repoDraft.gitUrl.trim().length === 0);

  const handlePickRepoFolder = async () => {
    const selectedPath = await openLocalFolderDialog(repoDraft.path.trim() || undefined);
    if (selectedPath) {
      setRepoDraft((previous) => {
        const nextKey = previous.keyEdited ? previous.key : deriveDefaultRepoKey(selectedPath);
        return { ...previous, path: selectedPath, key: nextKey };
      });
    }
  };

  const handleCreateRepo = () => {
    if (isCreating) {
      return;
    }

    const name = repoDraft.name.trim();
    const location = repoDraft.source === "local" ? repoDraft.path.trim() : repoDraft.gitUrl.trim();

    if (!name || !location) {
      return;
    }

    createProjectMutation.mutate(
      {
        name,
        key: normalizedKey,
        source: repoDraft.source,
        path: repoDraft.source === "local" ? location : "",
        gitUrl: repoDraft.source === "remote" ? location : "",
      },
      {
        onError: (error) => {
          console.error("Failed to create project", error);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={resetAndClose}
      fullWidth
      maxWidth="sm"
      disableEscapeKeyDown={isCreating}
    >
      <DialogTitle>{t("project.actions.addRepository")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("project.form.name")}
            </Typography>
            <TextField
              autoFocus
              size="small"
              disabled={isCreating}
              value={repoDraft.name}
              onChange={(event) =>
                setRepoDraft((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
              fullWidth
            />
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("project.form.key")}
            </Typography>
            <TextField
              size="small"
              disabled={isCreating}
              value={repoDraft.key}
              onChange={(event) =>
                setRepoDraft((previous) => ({
                  ...previous,
                  key: event.target.value,
                  keyEdited: true,
                }))
              }
              error={isKeyInvalid}
              helperText={isKeyInvalid ? t("project.form.keyInvalid") : t("project.form.keyHelp")}
              fullWidth
            />
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("project.form.source.label")}
            </Typography>
            <ButtonGroup size="small" fullWidth>
              <Button
                startIcon={<LuFolder size={14} />}
                variant={repoDraft.source === "local" ? "contained" : "outlined"}
                disabled={isCreating}
                onClick={() =>
                  setRepoDraft((previous) => ({
                    ...previous,
                    source: "local",
                    key: previous.keyEdited ? previous.key : deriveDefaultRepoKey(previous.path),
                  }))
                }
              >
                {t("project.form.source.local")}
              </Button>
              <Button
                startIcon={<LuGlobe size={14} />}
                variant={repoDraft.source === "remote" ? "contained" : "outlined"}
                disabled={isCreating}
                onClick={() =>
                  setRepoDraft((previous) => ({
                    ...previous,
                    source: "remote",
                    key: previous.keyEdited ? previous.key : deriveDefaultRepoKey(previous.gitUrl),
                  }))
                }
              >
                {t("project.form.source.remote")}
              </Button>
            </ButtonGroup>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {repoDraft.source === "local" ? t("project.form.path") : t("project.form.gitUrl")}
            </Typography>
            <TextField
              size="small"
              value={repoDraft.source === "local" ? repoDraft.path : repoDraft.gitUrl}
              disabled={isCreating}
              onChange={(event) =>
                setRepoDraft((previous) => {
                  const nextLocation = event.target.value;
                  const nextKey = previous.keyEdited ? previous.key : deriveDefaultRepoKey(nextLocation);
                  return {
                    ...previous,
                    [repoDraft.source === "local" ? "path" : "gitUrl"]: nextLocation,
                    key: nextKey,
                  };
                })
              }
              fullWidth
              placeholder={repoDraft.source === "remote" ? "https://github.com/org/repo.git" : undefined}
              slotProps={
                repoDraft.source === "local"
                  ? {
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title={t("project.form.chooseFolder")} arrow>
                              <IconButton
                                edge="end"
                                aria-label={t("project.form.chooseFolder")}
                                disabled={isCreating}
                                onClick={handlePickRepoFolder}
                              >
                                <LuFolderOpen size={18} />
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      },
                    }
                  : undefined
              }
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={resetAndClose} disabled={isCreating}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleCreateRepo()}
          disabled={isCreateDisabled || isCreating}
          startIcon={isCreating ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isCreating ? t("common.actions.creating", { defaultValue: "Creating..." }) : t("project.form.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
