import { Box, Typography } from "@mui/material";
import { RecentAgentSessions } from "@renderer/features/agent";
import { createNewWhiteboard } from "@renderer/features/files";
import { useTranslation } from "react-i18next";
import {
  LuCircle,
  LuCircleCheck,
  LuCircleX,
  LuGlobe,
  LuLoaderCircle,
  LuPencil,
  LuSearch,
  LuSparkles,
  LuSquareTerminal,
  LuTriangleAlert,
} from "react-icons/lu";
import { useWorkbenchCommands, useWorkspaceCommands } from "../../../app/commands/useCommands";
import { AgentIcon } from "../../../components/AgentIcon";
import {
  type WorkspaceCreateProgressStep,
  workspaceCreateProgressStore,
} from "../../../features/workspace/state/workspaceCreateProgressStore";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND,
  DEFAULT_AGENT_COMMANDS,
  type DesktopAgentKind,
} from "../../../helpers/agentSettings";
import { getRendererPlatform } from "../../../helpers/platform";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";

function CreateProgressStepIcon({ step }: { step: WorkspaceCreateProgressStep }) {
  if (step.status === "completed") {
    return (
      <Box component="span" sx={{ display: "inline-flex", color: "success.main" }}>
        <LuCircleCheck size={16} />
      </Box>
    );
  }

  if (step.status === "skipped") {
    return (
      <Box component="span" sx={{ display: "inline-flex", color: "text.disabled" }}>
        <LuCircleCheck size={16} />
      </Box>
    );
  }

  if (step.status === "failed") {
    return <LuCircleX size={16} color="var(--mui-palette-error-main)" />;
  }

  if (step.status === "warning") {
    return <LuTriangleAlert size={16} color="var(--mui-palette-warning-main)" />;
  }

  if (step.status === "running") {
    return (
      <Box component="span" sx={{ display: "inline-flex", color: "warning.main" }}>
        <LuLoaderCircle size={16} className="spin" />
      </Box>
    );
  }

  return <LuCircle size={16} />;
}

export type LaunchViewProps = {
  workspaceId: string;
  enabledAgentKinds: DesktopAgentKind[];
};

/** Renders quick actions when no tab is open in the selected workspace. */
export function LaunchView({ workspaceId, enabledAgentKinds }: LaunchViewProps) {
  const { t } = useTranslation();
  const workspace = workspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const workspaceCreateProgress = workspaceCreateProgressStore((state) => state.progressByWorkspaceId[workspaceId]);
  const { openTab } = useWorkbenchCommands();
  const { openWorkspaceFileSearch } = useWorkspaceCommands();
  const workspaces = workspaceStore((state) => state.workspaces);
  const platform = getRendererPlatform();
  const isPreparingWorkspace = workspace?.status === "provisioning" && Boolean(workspaceCreateProgress);
  const selectedWorkspace = workspaces.find((w) => w.id === workspaceId);

  const launchActions = [
    {
      id: "agent-chat",
      label: t("launch.actions.openAgentChat"),
      shortcutLabel: getShortcutDisplayLabelById("open-agent-chat", platform),
      icon: <LuSparkles size={16} />,
      onClick: () =>
        openTab({
          workspaceId,
          kind: "agent-chat",
          title: t("agentChat.title"),
          cwd: selectedWorkspace?.worktreePath || undefined,
        }),
    },
    {
      id: "whiteboard",
      label: t("launch.actions.openWhiteboard"),
      shortcutLabel: getShortcutDisplayLabelById("open-whiteboard", platform),
      icon: <LuPencil size={16} />,
      onClick: () => {
        void createNewWhiteboard(workspaceId);
      },
    },
    {
      id: "browser",
      label: t("launch.actions.openBrowser"),
      shortcutLabel: getShortcutDisplayLabelById("open-browser", platform),
      icon: <LuGlobe size={16} />,
      onClick: () =>
        openTab({
          workspaceId,
          kind: "browser",
          url: "",
        }),
    },
    {
      id: "terminal",
      label: t("launch.actions.openTerminal"),
      shortcutLabel: getShortcutDisplayLabelById("open-terminal", platform),
      icon: <LuSquareTerminal size={16} />,
      onClick: () =>
        openTab({
          workspaceId,
          kind: "terminal",
          title: t("terminal.title"),
          reuseExisting: false,
        }),
    },
    {
      id: "search-files",
      label: t("launch.actions.searchFiles"),
      shortcutLabel: getShortcutDisplayLabelById("open-file-search", platform),
      icon: <LuSearch size={16} />,
      onClick: openWorkspaceFileSearch,
    },
  ];

  if (isPreparingWorkspace && workspaceCreateProgress) {
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
        <Typography variant="h6">Preparing workspace</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          You can follow setup progress here while the daemon finishes provisioning.
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.25,
            width: "min(420px, 100%)",
            mt: 1,
            "@keyframes workspace-create-spin": {
              from: { transform: "rotate(0deg)" },
              to: { transform: "rotate(360deg)" },
            },
            "& .spin": {
              animation: "workspace-create-spin 1s linear infinite",
            },
          }}
        >
          {workspaceCreateProgress.steps.map((step) => (
            <Box
              key={step.id}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1.5,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                px: 1.25,
                py: 1,
                bgcolor: "background.paper",
              }}
            >
              <Box sx={{ display: "inline-flex", mt: 0.25, color: "text.secondary" }}>
                <CreateProgressStepIcon step={step} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2">{step.label}</Typography>
                {step.message ? (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                    }}
                  >
                    {step.message}
                  </Typography>
                ) : null}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

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
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 1,
              mb: 3,
            }}
          >
            {t("launch.hint")}
          </Typography>

          {/* Quick-action list */}
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
                  "&:hover:not(:disabled)": {
                    bgcolor: "action.hover",
                    borderColor: "action.selected",
                  },
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
                    sx={{
                      color: "text.secondary",
                      fontSize: 13,
                      lineHeight: 1,
                    }}
                  >
                    {action.shortcutLabel}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Box>

          {/* Agent grid */}
          {enabledAgentKinds.length > 0 && (
            <Box sx={{ width: "min(360px, 100%)", mt: 2 }}>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  display: "block",
                  mb: 2,
                  textAlign: "center",
                }}
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
                  const launchCommand = DEFAULT_AGENT_COMMANDS[agentKind];
                  return (
                    <Box
                      key={agentKind}
                      component="button"
                      type="button"
                      disabled={!workspaceId}
                      onClick={() =>
                        openTab({
                          workspaceId,
                          kind: "terminal",
                          title: t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind]),
                          launchCommand,
                          agentKind,
                          reuseExisting: false,
                        })
                      }
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
                        "&:hover:not(:disabled)": {
                          bgcolor: "action.hover",
                          borderColor: "action.selected",
                        },
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
          )}
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
          <RecentAgentSessions workspaceId={workspaceId} cwd={selectedWorkspace?.worktreePath} />
        </Box>
      </Box>
    </Box>
  );
}
