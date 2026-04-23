import {
  Box,
  Button,
  ButtonGroup,
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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LuFolder, LuFolderOpen, LuGlobe } from "react-icons/lu";
import { useCommands } from "../../../hooks/useCommands";

type CreateProjectDialogViewProps = {
  open: boolean;
  onClose: () => void;
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

export function CreateProjectDialogView({ open, onClose }: CreateProjectDialogViewProps) {
  const { t } = useTranslation();
  const { createRepo, openLocalFolderDialog } = useCommands();
  const [repoDraft, setRepoDraft] = useState({
    name: "",
    key: "",
    source: "local" as "local" | "remote",
    path: "",
    gitUrl: "",
    keyEdited: false,
  });

  const resetAndClose = () => {
    setRepoDraft({ name: "", key: "", source: "local", path: "", gitUrl: "", keyEdited: false });
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
    const name = repoDraft.name.trim();
    const location = repoDraft.source === "local" ? repoDraft.path.trim() : repoDraft.gitUrl.trim();

    if (!name || !location) {
      return;
    }

    createRepo({
      name,
      key: normalizedKey,
      source: repoDraft.source,
      path: repoDraft.source === "local" ? location : "",
      gitUrl: repoDraft.source === "remote" ? location : "",
    });
    resetAndClose();
  };

  return (
    <Dialog open={open} onClose={resetAndClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("repo.actions.addRepository")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("repo.form.name")}
            </Typography>
            <TextField
              autoFocus
              size="small"
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
              {t("repo.form.key")}
            </Typography>
            <TextField
              size="small"
              value={repoDraft.key}
              onChange={(event) =>
                setRepoDraft((previous) => ({
                  ...previous,
                  key: event.target.value,
                  keyEdited: true,
                }))
              }
              error={isKeyInvalid}
              helperText={isKeyInvalid ? t("repo.form.keyInvalid") : t("repo.form.keyHelp")}
              fullWidth
            />
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t("repo.form.source.label")}
            </Typography>
            <ButtonGroup size="small" fullWidth>
              <Button
                startIcon={<LuFolder size={14} />}
                variant={repoDraft.source === "local" ? "contained" : "outlined"}
                onClick={() =>
                  setRepoDraft((previous) => ({
                    ...previous,
                    source: "local",
                    key: previous.keyEdited ? previous.key : deriveDefaultRepoKey(previous.path),
                  }))
                }
              >
                {t("repo.form.source.local")}
              </Button>
              <Button
                startIcon={<LuGlobe size={14} />}
                variant={repoDraft.source === "remote" ? "contained" : "outlined"}
                onClick={() =>
                  setRepoDraft((previous) => ({
                    ...previous,
                    source: "remote",
                    key: previous.keyEdited ? previous.key : deriveDefaultRepoKey(previous.gitUrl),
                  }))
                }
              >
                {t("repo.form.source.remote")}
              </Button>
            </ButtonGroup>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {repoDraft.source === "local" ? t("repo.form.path") : t("repo.form.gitUrl")}
            </Typography>
            <TextField
              size="small"
              value={repoDraft.source === "local" ? repoDraft.path : repoDraft.gitUrl}
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
                            <Tooltip title={t("repo.form.chooseFolder")} arrow>
                              <IconButton
                                edge="end"
                                aria-label={t("repo.form.chooseFolder")}
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
        <Button onClick={resetAndClose}>{t("common.actions.cancel")}</Button>
        <Button variant="contained" onClick={handleCreateRepo} disabled={isCreateDisabled}>
          {t("repo.form.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
