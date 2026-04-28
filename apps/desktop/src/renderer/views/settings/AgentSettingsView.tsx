import { Alert, Box, Button, Chip, CircularProgress, Stack, Switch } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "../../components/AgentIcon";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "../../helpers/agentSettings";
import { withTimeout } from "../../helpers/withTimeout";
import { useCommands } from "../../hooks/useCommands";
import { agentSettingsStore } from "../../store/agentSettingsStore";

type AgentDetectionByKind = Record<DesktopAgentKind, boolean | undefined>;
type AgentVersionByKind = Record<DesktopAgentKind, string | undefined>;

const AGENT_DETECTION_TIMEOUT_MS = 10_000;
const AGENT_RECHECK_MIN_DURATION_MS = 500;

/** Creates one default agent-detection map with unknown status for each supported agent. */
function createDefaultAgentDetectionByKind(): AgentDetectionByKind {
  return SUPPORTED_DESKTOP_AGENT_KINDS.reduce<AgentDetectionByKind>((nextMap, agentKind) => {
    nextMap[agentKind] = undefined;
    return nextMap;
  }, {} as AgentDetectionByKind);
}

/** Creates one default agent-version map for each supported agent. */
function createDefaultAgentVersionByKind(): AgentVersionByKind {
  return SUPPORTED_DESKTOP_AGENT_KINDS.reduce<AgentVersionByKind>((nextMap, agentKind) => {
    nextMap[agentKind] = undefined;
    return nextMap;
  }, {} as AgentVersionByKind);
}

/** Builds one detection lookup map from one API status list while preserving all supported agents. */
function buildDetectionByKind(
  statuses: Array<{ agentKind: DesktopAgentKind; detected: boolean; version?: string }>,
): AgentDetectionByKind {
  const nextMap = createDefaultAgentDetectionByKind();
  for (const status of statuses) {
    nextMap[status.agentKind] = status.detected;
  }
  return nextMap;
}

/** Builds one version lookup map from one API status list while preserving all supported agents. */
function buildVersionByKind(
  statuses: Array<{ agentKind: DesktopAgentKind; detected: boolean; version?: string }>,
): AgentVersionByKind {
  const nextMap = createDefaultAgentVersionByKind();
  for (const status of statuses) {
    nextMap[status.agentKind] = typeof status.version === "string" ? status.version.trim() || undefined : undefined;
  }
  return nextMap;
}

/** Renders settings for supported desktop agents with detection state and in-use toggles. */
export function AgentSettingsView() {
  const { t } = useTranslation();
  const { listAgentDetectionStatuses } = useCommands();
  const inUseByAgentKind = agentSettingsStore((state) => state.inUseByAgentKind);
  const setAgentInUse = agentSettingsStore((state) => state.setAgentInUse);
  const [detectedByAgentKind, setDetectedByAgentKind] = useState<AgentDetectionByKind>(
    createDefaultAgentDetectionByKind,
  );
  const [versionByAgentKind, setVersionByAgentKind] = useState<AgentVersionByKind>(createDefaultAgentVersionByKind);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const latestDetectionLoadIdRef = useRef(0);
  const isMountedRef = useRef(true);

  /** Loads current per-agent detection state and updates the view model. */
  const loadDetectionStatuses = useCallback(
    async (isManualRefresh: boolean) => {
      const loadId = latestDetectionLoadIdRef.current + 1;
      latestDetectionLoadIdRef.current = loadId;
      const isLatestMountedLoad = () => isMountedRef.current && latestDetectionLoadIdRef.current === loadId;
      const refreshStartedAt = isManualRefresh ? Date.now() : null;

      if (isManualRefresh) {
        setIsRefreshing(true);
      }

      setHasLoadError(false);

      try {
        const statuses = await withTimeout(
          listAgentDetectionStatuses(),
          AGENT_DETECTION_TIMEOUT_MS,
          `Agent detection timed out after ${AGENT_DETECTION_TIMEOUT_MS}ms`,
        );
        if (!isLatestMountedLoad()) {
          return;
        }
        setDetectedByAgentKind(buildDetectionByKind(statuses));
        setVersionByAgentKind(buildVersionByKind(statuses));
      } catch (error) {
        console.error("[AgentSettingsView] Failed to load agent detection statuses", error);
        if (!isLatestMountedLoad()) {
          return;
        }
        setHasLoadError(true);
      } finally {
        if (refreshStartedAt !== null) {
          const elapsedMs = Date.now() - refreshStartedAt;
          const remainingMs = AGENT_RECHECK_MIN_DURATION_MS - elapsedMs;
          if (remainingMs > 0) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, remainingMs);
            });
          }
        }

        if (isLatestMountedLoad()) {
          if (isManualRefresh) {
            setIsRefreshing(false);
          }
          setIsLoading(false);
        }
      }
    },
    [listAgentDetectionStatuses],
  );

  useEffect(() => {
    /** Performs initial agent detection load for the settings panel. */
    void loadDetectionStatuses(false);
  }, [loadDetectionStatuses]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.agents.title")}
        description={t("settings.agents.description")}
        action={
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              void loadDetectionStatuses(true);
            }}
            disabled={isRefreshing}
            startIcon={isRefreshing || isLoading ? <CircularProgress size={14} /> : null}
          >
            {t("settings.agents.actions.recheckAll")}
          </Button>
        }
      />
      <SettingsCard>
        {hasLoadError ? <Alert severity="error">{t("settings.agents.loadError")}</Alert> : null}
        <SettingsRows>
          {SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => {
            const rawDetected = detectedByAgentKind[agentKind];
            const isStatusPending = rawDetected === undefined && (isLoading || isRefreshing) && !hasLoadError;
            const rawVersion = versionByAgentKind[agentKind];
            const statusLabel = isStatusPending
              ? t("settings.agents.status.checking")
              : rawDetected
                ? rawVersion
                  ? (
                      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                        <Box component="span">{t("settings.agents.status.versionPrefix")}</Box>
                        <Box component="span" sx={{ fontWeight: 700 }}>
                          {rawVersion}
                        </Box>
                      </Box>
                    )
                  : t("settings.agents.status.versionUnknown")
                : t("settings.agents.status.notDetected");
            const statusColor = isStatusPending ? "default" : rawDetected ? "success" : "default";
            const statusVariant = isStatusPending ? "outlined" : rawDetected ? "filled" : "outlined";

            return (
              <SettingsControlRow
                key={agentKind}
                title={
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <AgentIcon agentKind={agentKind} context="settingsRow" decorative />
                    <Box component="span">{t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind])}</Box>
                  </Box>
                }
                control={
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
                    <Chip
                      size="small"
                      label={statusLabel}
                      color={statusColor}
                      variant={statusVariant}
                    />
                    <Switch
                      checked={inUseByAgentKind[agentKind]}
                      onChange={(event) => {
                        setAgentInUse(agentKind, event.target.checked);
                      }}
                      slotProps={{
                        input: {
                          "aria-label": `${t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind])} ${t("settings.agents.inUse")}`,
                        },
                      }}
                    />
                  </Stack>
                }
              />
            );
          })}
        </SettingsRows>
      </SettingsCard>
    </Box>
  );
}
