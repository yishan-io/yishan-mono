import { IconButton, InputAdornment, TextField, Tooltip } from "@mui/material";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AGENT_COMMAND_MAX_LENGTH,
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  DEFAULT_AGENT_COMMANDS,
  type DesktopAgentKind,
  validateAgentCommand,
} from "../../helpers/agentSettings";

type AgentCommandInputProps = {
  agentKind: DesktopAgentKind;
  currentCommand: string | undefined;
  onSave: (agentKind: DesktopAgentKind, command: string) => void;
  onReset: (agentKind: DesktopAgentKind) => void;
};

/** Renders an inline editable command field for one agent row. */
export function AgentCommandInput({ agentKind, currentCommand, onSave, onReset }: AgentCommandInputProps) {
  const { t } = useTranslation();
  const defaultCommand = DEFAULT_AGENT_COMMANDS[agentKind];
  const [draft, setDraft] = useState<string>(currentCommand ?? "");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const hasCustomCommand = currentCommand !== undefined;
  const isDirty = draft !== (currentCommand ?? "");

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(event.target.value);
      if (errorKey) {
        setErrorKey(null);
      }
    },
    [errorKey],
  );

  const handleCommit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onReset(agentKind);
      setDraft("");
      setErrorKey(null);
      return;
    }
    const validationErrorKey = validateAgentCommand(trimmed);
    if (validationErrorKey) {
      setErrorKey(validationErrorKey);
      return;
    }
    onSave(agentKind, trimmed);
    setErrorKey(null);
  }, [agentKind, draft, onSave, onReset]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleCommit();
      }
    },
    [handleCommit],
  );

  const handleReset = useCallback(() => {
    onReset(agentKind);
    setDraft("");
    setErrorKey(null);
  }, [agentKind, onReset]);

  return (
    <TextField
      size="small"
      value={draft}
      onChange={handleChange}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      placeholder={t("settings.agents.command.placeholder", { defaultCommand })}
      error={errorKey !== null}
      helperText={errorKey ? t(errorKey) : undefined}
      inputProps={{
        maxLength: AGENT_COMMAND_MAX_LENGTH,
        "aria-label": `${t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind])} ${t("settings.agents.command.label")}`,
        spellCheck: false,
        autoComplete: "off",
        autoCorrect: "off",
        autoCapitalize: "off",
        sx: { fontSize: "0.85rem", color: "text.secondary" },
      }}
      slotProps={{
        input: {
          endAdornment: hasCustomCommand ? (
            <InputAdornment position="end">
              <Tooltip title={t("settings.agents.command.resetAriaLabel")}>
                <IconButton
                  size="small"
                  onClick={handleReset}
                  aria-label={t("settings.agents.command.resetAriaLabel")}
                  edge="end"
                >
                  ↺
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ) : isDirty ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={handleCommit}
                aria-label={t("settings.agents.command.label")}
                edge="end"
              >
                ✓
              </IconButton>
            </InputAdornment>
          ) : null,
        },
      }}
      sx={{ minWidth: 0, width: "100%" }}
    />
  );
}
