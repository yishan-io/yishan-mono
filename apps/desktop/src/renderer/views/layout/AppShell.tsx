import { Alert, Box, IconButton, LinearProgress, Snackbar, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuTriangleAlert } from "react-icons/lu";
import { Outlet } from "react-router-dom";
import { isDaemonVersionOutdated } from "../../helpers/versionHelpers";
import { useDaemonConnectionMonitor } from "../../hooks/useDaemonConnectionMonitor";
import { useShortcuts } from "../../hooks/useShortcuts";
import { sessionStore } from "../../store/sessionStore";

/** Renders the app frame and route content. */
export function AppShell() {
  const { t } = useTranslation();
  useShortcuts();
  const daemonConnectionStatus = useDaemonConnectionMonitor();
  const isReconnecting = daemonConnectionStatus !== "connected";
  const daemonVersion = sessionStore((state) => state.daemonVersion);
  const appVersion = sessionStore((state) => state.appVersion);
  const isDaemonOutdated = isDaemonVersionOutdated({ daemonVersion, appVersion });

  return (
    <Box
      sx={{
        height: "100vh",
        width: "100%",
        display: "relative",
        overflow: "hidden",
        bgcolor: "background.default",
        color: "text.primary",
        boxSizing: "border-box",
        flex: 1,
      }}
    >
      {isReconnecting ? (
        <LinearProgress
          color="warning"
          sx={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: (theme) => theme.zIndex.snackbar }}
        />
      ) : null}
      <Outlet />
      <Snackbar open={isReconnecting} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="warning" variant="filled">
          {t("daemon.connection.reconnecting")}
        </Alert>
      </Snackbar>
      {isDaemonOutdated ? (
        <Tooltip
          arrow
          placement="left"
          title={
            <>
              {t("daemon.version.outdatedMessage", {
                daemonVersion: daemonVersion ?? t("settings.daemon.values.unknown"),
                appVersion: appVersion ?? t("settings.daemon.values.unknown"),
              })}
            </>
          }
        >
          <IconButton
            size="small"
            color="warning"
            sx={{
              position: "absolute",
              right: 12,
              bottom: 12,
              zIndex: (theme) => theme.zIndex.snackbar,
              backgroundColor: "background.paper",
              border: (theme) => `1px solid ${theme.palette.warning.main}`,
              "&:hover": {
                backgroundColor: "background.paper",
              },
            }}
          >
            <LuTriangleAlert size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
}
