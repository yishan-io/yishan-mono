import { Alert, Box, Stack, Switch, Typography } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CLIToolStatus } from "../../../features/settings/commands/cliToolCommands";
import { AgentIcon } from "@renderer/features/agent";
import { SettingsCard, SettingsRows, SettingsSectionHeader } from "../../../components/settings";
import {
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION,
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  isDesktopAgentKind,
} from "../../../helpers/agentSettings";
import { agentSettingsStore } from "../../../features/settings/state/agentSettingsStore";

type AgentCLISettingsCardProps = {
  statuses: CLIToolStatus[];
  isLoading: boolean;
  isRefreshing: boolean;
  hasLoadError: boolean;
};

/** Renders the "other agents" section of the CLI page: detected agents with in-use toggles. */
export function AgentCLISettingsCard({ statuses, isLoading, isRefreshing, hasLoadError }: AgentCLISettingsCardProps) {
  const { t } = useTranslation();
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const setAgentInUse = agentSettingsStore((state) => state.setAgentInUse);

  const statusByToolID = useMemo(() => {
    const nextMap = new Map<string, CLIToolStatus>();
    for (const status of statuses) {
      nextMap.set(status.toolId, status);
    }
    return nextMap;
  }, [statuses]);

  // Only agents actually detected on this machine are listed; pi has its own
  // dedicated section above.
  const visibleAgentKinds = SUPPORTED_DESKTOP_AGENT_KINDS.filter(
    (agentKind) =>
      !AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION.has(agentKind) && statusByToolID.get(agentKind)?.installed === true,
  );

  const isStatusPending = isLoading || isRefreshing;

  return (
    <Box data-testid="agent-settings-panel">
      <SettingsSectionHeader title={t("settings.cli.agentsTitle")} description={t("settings.agents.description")} />
      <SettingsCard>
        {hasLoadError ? <Alert severity="error">{t("settings.agents.loadError")}</Alert> : null}
        <SettingsRows>
          {visibleAgentKinds.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {isStatusPending ? t("settings.agents.status.checking") : t("settings.agents.noneDetected")}
            </Typography>
          ) : (
            visibleAgentKinds.map((agentKind) => {
              const status = statusByToolID.get(agentKind);
              const version = status?.version;
              const label = version ? `v${version}` : t("settings.agents.status.versionUnknown");

              return (
                <Box key={agentKind} sx={{ py: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                      <AgentIcon agentKind={agentKind as DesktopAgentKind} context="settingsRow" decorative />
                      <Box component="span" sx={{ typography: "body2" }}>
                        {t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind as DesktopAgentKind])}
                      </Box>
                    </Box>
                    <Stack sx={{ display: "flex", flexDirection: "row", gap: 1, alignItems: "center" }}>
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                        <Box
                          sx={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            flexShrink: 0,
                            bgcolor: "success.main",
                          }}
                        />
                        <Box
                          component="span"
                          sx={{ typography: "body2", color: "text.secondary", whiteSpace: "nowrap" }}
                        >
                          {label}
                        </Box>
                      </Box>
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
                </Box>
              );
            })
          )}
        </SettingsRows>
      </SettingsCard>
    </Box>
  );
}
