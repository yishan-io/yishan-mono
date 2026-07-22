import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Radio,
  Stack,
  Switch,
  TextField,
  Tooltip,
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuRefreshCw } from "react-icons/lu";
import type { CLIToolStatus } from "../../commands/cliToolCommands";
import { AgentIcon } from "../../components/AgentIcon";
import { SettingsCard, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import {
  AGENT_COMMAND_MAX_LENGTH,
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  DEFAULT_AGENT_COMMANDS,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  isDesktopAgentKind,
  validateAgentCommand,
} from "../../helpers/agentSettings";
import { useCommands } from "../../hooks/useCommands";
import { useRefreshableLoader } from "../../hooks/useRefreshableLoader";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";

const CLI_TOOLS_STATUS_TIMEOUT_MS = 15_000;
const CLI_TOOLS_RECHECK_MIN_DURATION_MS = 500;

type AgentCommandInputProps = {
  agentKind: DesktopAgentKind;
  currentCommand: string | undefined;
  onSave: (agentKind: DesktopAgentKind, command: string) => void;
  onReset: (agentKind: DesktopAgentKind) => void;
};

/**
 * Renders an inline editable command field for one agent row.
 * Supports save on Enter/blur and reset to the system default.
 */
function AgentCommandInput({ agentKind, currentCommand, onSave, onReset }: AgentCommandInputProps) {
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
      // Empty commit clears the override.
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
                <IconButton onClick={handleReset} aria-label={t("settings.agents.command.resetAriaLabel")} edge="end">
                  ↺
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ) : isDirty ? (
            <InputAdornment position="end">
              <IconButton onClick={handleCommit} aria-label={t("settings.agents.command.label")} edge="end">
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

export function CLIToolsSettingsView() {
  const { t } = useTranslation();
  const { listCLIToolStatuses } = useCommands();
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const defaultAgentKind = agentSettingsStore((state) => state.defaultAgentKind);
  const customCommandByAgentKind = agentSettingsStore((state) => state.customCommandByAgentKind);
  const setAgentInUse = agentSettingsStore((state) => state.setAgentInUse);
  const setDefaultAgentKind = agentSettingsStore((state) => state.setDefaultAgentKind);
  const setAgentCustomCommand = agentSettingsStore((state) => state.setAgentCustomCommand);
  const resetAgentCustomCommand = agentSettingsStore((state) => state.resetAgentCustomCommand);

  const fetchStatuses = useCallback(
    (isManualRefresh: boolean) => listCLIToolStatuses(isManualRefresh),
    [listCLIToolStatuses],
  );
  const {
    data: statusesData,
    isLoading,
    isRefreshing,
    hasLoadError,
    refresh,
  } = useRefreshableLoader({
    fetch: fetchStatuses,
    timeoutMs: CLI_TOOLS_STATUS_TIMEOUT_MS,
    minRefreshMs: CLI_TOOLS_RECHECK_MIN_DURATION_MS,
  });
  const statuses: CLIToolStatus[] = statusesData ?? [];

  const statusByToolID = useMemo(() => {
    const nextMap = new Map<string, CLIToolStatus>();
    for (const status of statuses) {
      nextMap.set(status.toolId, status);
    }
    return nextMap;
  }, [statuses]);

  const isStatusPending = isLoading || isRefreshing;

  return (
    <Box data-testid="agent-settings-panel">
      <SettingsSectionHeader
        title={t("settings.agents.title")}
        description={t("settings.agents.description")}
        action={
          <Button
            size="small"
            variant="text"
            onClick={() => {
              refresh();
            }}
            disabled={isRefreshing}
            startIcon={isRefreshing || isLoading ? <CircularProgress size={14} /> : <LuRefreshCw />}
          >
            {t("settings.agents.actions.rescanAll")}
          </Button>
        }
      />

      <Stack spacing={2}>
        <SettingsCard>
          {hasLoadError ? <Alert severity="error">{t("settings.agents.loadError")}</Alert> : null}
          <SettingsRows>
            {SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => {
              const status = statusByToolID.get(agentKind);
              const detected = status?.installed;
              const version = status?.version;
              const isPending = isStatusPending && !status;
              const label = isPending
                ? t("settings.agents.status.checking")
                : detected
                  ? version
                    ? `v${version}`
                    : t("settings.agents.status.versionUnknown")
                  : t("settings.agents.status.notDetected");

              return (
                <Box key={agentKind} sx={{ py: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                      <AgentIcon agentKind={agentKind as DesktopAgentKind} context="settingsRow" decorative />
                      <Box component="span" sx={{ typography: "body2" }}>
                        {t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind as DesktopAgentKind])}
                      </Box>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                        <Box
                          sx={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            flexShrink: 0,
                            bgcolor: detected ? "success.main" : "text.disabled",
                          }}
                        />
                        <Box
                          component="span"
                          sx={{ typography: "body2", color: "text.secondary", whiteSpace: "nowrap" }}
                        >
                          {label}
                        </Box>
                      </Box>
                      <Tooltip title={t("settings.agents.default.label")}>
                        <Box>
                          <Radio
                            checked={defaultAgentKind === agentKind}
                            disabled={!inUseByAgentKind[agentKind as DesktopAgentKind]}
                            onChange={() => {
                              if (!isDesktopAgentKind(agentKind)) {
                                return;
                              }
                              setDefaultAgentKind(agentKind);
                            }}
                            slotProps={{
                              input: {
                                "aria-label": `${t("settings.agents.default.ariaLabel")} ${t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind as DesktopAgentKind])}`,
                              },
                            }}
                          />
                        </Box>
                      </Tooltip>
                      <Switch
                        checked={inUseByAgentKind[agentKind as DesktopAgentKind]}
                        onChange={(event) => {
                          if (!isDesktopAgentKind(agentKind)) {
                            return;
                          }
                          setAgentInUse(agentKind, event.target.checked);
                        }}
                        slotProps={{
                          input: {
                            "aria-label": `${t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind as DesktopAgentKind])} ${t("settings.agents.inUse")}`,
                          },
                        }}
                      />
                    </Stack>
                  </Box>
                  <Box sx={{ mt: 0.75, ml: 3 }}>
                    <AgentCommandInput
                      agentKind={agentKind as DesktopAgentKind}
                      currentCommand={customCommandByAgentKind[agentKind as DesktopAgentKind]}
                      onSave={setAgentCustomCommand}
                      onReset={resetAgentCustomCommand}
                    />
                  </Box>
                </Box>
              );
            })}
          </SettingsRows>
        </SettingsCard>
      </Stack>
    </Box>
  );
}
