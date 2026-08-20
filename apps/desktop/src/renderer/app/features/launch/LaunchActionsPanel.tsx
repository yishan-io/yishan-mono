import { Box, Typography } from "@mui/material";
import { AgentIcon, RecentAgentSessions } from "@renderer/domains/agent";
import { AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND, type DesktopAgentKind } from "@renderer/domains/agent";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface LaunchAction {
  id: string;
  label: string;
  shortcutLabel: string | null;
  icon: ReactNode;
  onClick: () => void;
}

interface LaunchActionsPanelProps {
  workspaceId: string;
  workspacePath?: string;
  enabledAgentKinds: DesktopAgentKind[];
  launchActions: LaunchAction[];
  onAgentLaunch: (agentKind: DesktopAgentKind) => void;
}

function LaunchActionsPanel({
  workspaceId,
  workspacePath,
  enabledAgentKinds,
  launchActions,
  onAgentLaunch,
}: LaunchActionsPanelProps) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        flex: 1,
        px: 3,
        py: 4,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: { xs: "flex-start", md: "stretch" },
          justifyContent: "center",
          gap: 4,
          width: "min(900px, 100%)",
        }}
      >
        <Box sx={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "flex-start", minWidth: 0 }}>
          <Typography variant="h6">{t("launch.title")}</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, mb: 3 }}>
            {t("launch.hint")}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
            {launchActions.map((action) => (
              <Box
                key={action.id}
                component="button"
                type="button"
                onClick={action.onClick}
                disabled={!workspaceId}
                sx={{
                  width: "100%",
                  minHeight: 40,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1.25,
                  bgcolor: "background.paper",
                  color: "text.primary",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  cursor: workspaceId ? "pointer" : "not-allowed",
                  textAlign: "left",
                  typography: "body2",
                  transition: "background-color 0.15s, border-color 0.15s",
                  "&:hover:not(:disabled)": { bgcolor: "action.hover", borderColor: "action.selected" },
                }}
              >
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                  {action.icon}
                  <Box component="span">{action.label}</Box>
                </Box>
                {action.shortcutLabel ? (
                  <Typography
                    variant="caption"
                    component="span"
                    aria-hidden="true"
                    sx={{ color: "text.secondary", fontSize: 13, lineHeight: 1 }}
                  >
                    {action.shortcutLabel}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Box>
          {enabledAgentKinds.length > 0 ? (
            <Box sx={{ width: "min(360px, 100%)", mt: 2 }}>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", display: "block", mb: 2, textAlign: "center" }}
              >
                {t("launch.agents")}
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(enabledAgentKinds.length, 4)}, 80px)`,
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                {enabledAgentKinds.map((agentKind) => {
                  const label = t(AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND[agentKind]);
                  return (
                    <Box
                      key={agentKind}
                      component="button"
                      type="button"
                      disabled={!workspaceId}
                      onClick={() => onAgentLaunch(agentKind)}
                      sx={{
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1,
                        bgcolor: "background.paper",
                        color: "text.secondary",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.5,
                        py: 1.25,
                        px: 0.5,
                        cursor: workspaceId ? "pointer" : "not-allowed",
                        minWidth: 0,
                        transition: "background-color 0.15s, border-color 0.15s",
                        "&:hover:not(:disabled)": { bgcolor: "action.hover", borderColor: "action.selected" },
                      }}
                      aria-label={label}
                    >
                      <AgentIcon agentKind={agentKind} context="launchGrid" decorative />
                      <Typography
                        variant="caption"
                        component="span"
                        noWrap
                        sx={{ fontSize: "0.7rem", lineHeight: 1, maxWidth: "100%" }}
                      >
                        {label}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ) : null}
        </Box>
        <Box
          sx={{
            display: "flex",
            flex: 1,
            minWidth: 0,
            "--launch-section-divider": (theme) =>
              theme.palette.mode === "dark" ? theme.palette.grey[800] : theme.palette.grey[300],
            borderLeft: { md: "1px solid var(--launch-section-divider)" },
            borderTop: { xs: "1px solid var(--launch-section-divider)", md: 0 },
            pl: { md: 4 },
            pt: { xs: 3, md: 0 },
          }}
        >
          <RecentAgentSessions workspaceId={workspaceId} cwd={workspacePath} />
        </Box>
      </Box>
    </Box>
  );
}

export { LaunchActionsPanel };
export type { LaunchAction };
