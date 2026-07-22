import { Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import type { Dispatch, SetStateAction } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { type ProjectConfigDraft, createProjectConfigCommandDraft } from "../useProjectConfigFormState";

type ProjectConfigCommandsSectionProps = {
  draft: ProjectConfigDraft;
  isSaving: boolean;
  setDraft: Dispatch<SetStateAction<ProjectConfigDraft>>;
};

export function ProjectConfigCommandsSection({ draft, isSaving, setDraft }: ProjectConfigCommandsSectionProps) {
  return (
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
          sx={{ alignSelf: "flex-start" }}
        >
          Add command
        </Button>
      </Stack>
    </Stack>
  );
}
