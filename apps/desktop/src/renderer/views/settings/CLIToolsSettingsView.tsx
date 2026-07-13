import { Alert, Box, Button, CircularProgress, Radio, Stack, Switch, Tooltip } from "@mui/material";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LuRefreshCw } from "react-icons/lu";
import type { CLIToolStatus } from "../../commands/cliToolCommands";
import { AgentIcon } from "../../components/AgentIcon";
import { SettingsCard, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  isDesktopAgentKind,
} from "../../helpers/agentSettings";
import { useCommands } from "../../hooks/useCommands";
import { useRefreshableLoader } from "../../hooks/useRefreshableLoader";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { AgentCommandInput } from "./AgentCommandInput";

const CLI_TOOLS_STATUS_TIMEOUT_MS = 15_000;
const CLI_TOOLS_RECHECK_MIN_DURATION_MS = 500;

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
    <Box data-testid="cli-tools-settings-panel">
      <SettingsSectionHeader
        title={t("settings.cliTools.title")}
        description={t("settings.cliTools.description")}
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
            {t("settings.cliTools.actions.rescanAll")}
          </Button>
        }
      />

      <Stack spacing={2}>
        <SettingsCard>
          {hasLoadError ? <Alert severity="error">{t("settings.cliTools.loadError")}</Alert> : null}
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
