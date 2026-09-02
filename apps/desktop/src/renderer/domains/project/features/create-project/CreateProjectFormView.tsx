import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuFolder, LuFolderOpen, LuGlobe } from "react-icons/lu";
import { createProject } from "../../commands/projectCommands";
import { openLocalFolderDialog } from "../../host/folderPicker";
import { deriveDefaultProjectName } from "./createProjectNameDerivation";

type RepoDraft = {
  name: string;
  source: "local" | "remote";
  path: string;
  gitUrl: string;
  nameEdited: boolean;
  taskPrefix: string;
  taskPrefixEdited: boolean;
};

type CreateProjectInput = {
  name: string;
  taskPrefix: string;
  path?: string;
  gitUrl?: string;
};

type CreateProjectFormViewProps = {
  onCreated: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  autoFocus?: boolean;
  onBusyChange?: (isBusy: boolean) => void;
};

const defaultDraft: RepoDraft = {
  name: "",
  source: "local",
  path: "",
  gitUrl: "",
  nameEdited: false,
  taskPrefix: "",
  taskPrefixEdited: false,
};

function deriveTaskPrefix(name: string): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5);
  return letters.padEnd(3, "X");
}

function isValidTaskPrefix(taskPrefix: string): boolean {
  return /^[A-Z]{3,5}$/.test(taskPrefix) && taskPrefix !== "PERS";
}

/** Shared project creation form used by the dialog and first-project onboarding. */
export function CreateProjectFormView({
  onCreated,
  onCancel,
  submitLabel,
  autoFocus = true,
  onBusyChange,
}: CreateProjectFormViewProps) {
  const { t } = useTranslation();
  const [repoDraft, setRepoDraft] = useState<RepoDraft>(defaultDraft);
  const [pathError, setPathError] = useState<string | null>(null);

  const createProjectMutation = useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      await createProject(input);
    },
    onSuccess: () => {
      setRepoDraft(defaultDraft);
      onCreated();
    },
  });

  const isCreating = createProjectMutation.isPending;
  const isCreateDisabled =
    repoDraft.name.trim().length === 0 ||
    !isValidTaskPrefix(repoDraft.taskPrefix) ||
    (repoDraft.source === "local"
      ? repoDraft.path.trim().length === 0 || pathError !== null
      : repoDraft.gitUrl.trim().length === 0);

  useEffect(() => {
    onBusyChange?.(isCreating);
  }, [isCreating, onBusyChange]);

  const handlePickRepoFolder = async () => {
    const selectedPath = await openLocalFolderDialog(repoDraft.path.trim() || undefined);
    if (selectedPath) {
      setPathError(null);
      setRepoDraft((previous) => {
        const nextName = previous.nameEdited ? previous.name : deriveDefaultProjectName(selectedPath);
        return {
          ...previous,
          path: selectedPath,
          name: nextName,
          taskPrefix: previous.taskPrefixEdited ? previous.taskPrefix : deriveTaskPrefix(nextName),
        };
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
        taskPrefix: repoDraft.taskPrefix,
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
    <Stack
      spacing={2}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        handleCreateRepo();
      }}
    >
      <Box>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 1,
          }}
        >
          {t("project.form.source.label")}
        </Typography>
        <ButtonGroup size="small" fullWidth>
          <Button
            startIcon={<LuFolder size={14} />}
            variant={repoDraft.source === "local" ? "contained" : "outlined"}
            disabled={isCreating}
            onClick={() => {
              setPathError(null);
              setRepoDraft((previous) => {
                const nextName = previous.nameEdited ? previous.name : deriveDefaultProjectName(previous.path);
                return {
                  ...previous,
                  source: "local",
                  name: nextName,
                  taskPrefix: previous.taskPrefixEdited ? previous.taskPrefix : deriveTaskPrefix(nextName),
                };
              });
            }}
          >
            {t("project.form.source.local")}
          </Button>
          <Button
            startIcon={<LuGlobe size={14} />}
            variant={repoDraft.source === "remote" ? "contained" : "outlined"}
            disabled={isCreating}
            onClick={() => {
              setPathError(null);
              setRepoDraft((previous) => {
                const nextName = previous.nameEdited ? previous.name : deriveDefaultProjectName(previous.gitUrl);
                return {
                  ...previous,
                  source: "remote",
                  name: nextName,
                  taskPrefix: previous.taskPrefixEdited ? previous.taskPrefix : deriveTaskPrefix(nextName),
                };
              });
            }}
          >
            {t("project.form.source.remote")}
          </Button>
        </ButtonGroup>
      </Box>
      <Box>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 1,
          }}
        >
          {repoDraft.source === "local" ? t("project.form.path") : t("project.form.gitUrl")}
        </Typography>
        <TextField
          autoFocus={autoFocus}
          error={!!pathError}
          helperText={pathError}
          value={repoDraft.source === "local" ? repoDraft.path : repoDraft.gitUrl}
          disabled={isCreating}
          onChange={(event) => {
            setPathError(null);
            setRepoDraft((previous) => {
              const nextLocation = event.target.value;
              const nextName = previous.nameEdited ? previous.name : deriveDefaultProjectName(nextLocation);
              return {
                ...previous,
                [repoDraft.source === "local" ? "path" : "gitUrl"]: nextLocation,
                name: nextName,
                taskPrefix: previous.taskPrefixEdited ? previous.taskPrefix : deriveTaskPrefix(nextName),
                gitUrl: repoDraft.source === "local" ? "" : nextLocation,
              };
            });
          }}
          fullWidth
          placeholder={repoDraft.source === "remote" ? "https://github.com/org/repo.git" : undefined}
          slotProps={
            repoDraft.source === "local"
              ? {
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={t("project.form.chooseFolder")}>
                          <IconButton
                            size="medium"
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
      <Box>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 1,
          }}
        >
          {t("project.form.name")}
        </Typography>
        <TextField
          disabled={isCreating}
          value={repoDraft.name}
          onChange={(event) =>
            setRepoDraft((previous) => ({
              ...previous,
              name: event.target.value,
              nameEdited: true,
              taskPrefix: previous.taskPrefixEdited ? previous.taskPrefix : deriveTaskPrefix(event.target.value),
            }))
          }
          fullWidth
        />
      </Box>
      <Box>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 1,
          }}
        >
          {t("project.form.taskPrefix", { defaultValue: "Task prefix" })}
        </Typography>
        <TextField
          disabled={isCreating}
          slotProps={{
            htmlInput: {
              "aria-label": t("project.form.taskPrefix", { defaultValue: "Task prefix" }),
              maxLength: 5,
            },
          }}
          value={repoDraft.taskPrefix}
          onChange={(event) =>
            setRepoDraft((previous) => ({
              ...previous,
              taskPrefix: event.target.value.toUpperCase(),
              taskPrefixEdited: true,
            }))
          }
          fullWidth
          helperText={t("project.form.taskPrefixHelp", { defaultValue: "3–5 uppercase letters. PERS is reserved." })}
        />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          justifyContent: "flex-end",
        }}
      >
        {onCancel ? (
          <Button onClick={onCancel} disabled={isCreating}>
            {t("common.actions.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="contained"
          disabled={isCreateDisabled || isCreating}
          startIcon={isCreating ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isCreating
            ? t("common.actions.creating", { defaultValue: "Creating..." })
            : (submitLabel ?? t("project.form.create"))}
        </Button>
      </Stack>
    </Stack>
  );
}
