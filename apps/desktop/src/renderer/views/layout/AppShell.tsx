import { Alert, Box, LinearProgress, Snackbar } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { useDaemonConnectionMonitor } from "../../hooks/useDaemonConnectionMonitor";
import { useShortcuts } from "../../hooks/useShortcuts";

/** Renders the app frame and route content. */
export function AppShell() {
  const { t } = useTranslation();
  useShortcuts();
  const daemonConnectionStatus = useDaemonConnectionMonitor();
  const isReconnecting = daemonConnectionStatus !== "connected";

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
    </Box>
  );
}
