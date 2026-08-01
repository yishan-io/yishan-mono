import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import yishanLogo from "../../../assets/images/yishan-transparent.png";
import { AppBackgroundContainer } from "../../components/AppBackgroundContainer";
import { getDaemonClient } from "../../rpc/rpcTransport";

type MigrationViewProps = {
  onComplete: () => void;
};

export function MigrationView({ onComplete }: MigrationViewProps) {
  const [projectsDone, setProjectsDone] = useState(false);
  const [usageDone, setUsageDone] = useState(false);

  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      try {
        const client = await getDaemonClient();
        const raw = await client.tokenUsage.migrationStatus();
        const status = raw as {
          projectsMigrated?: boolean;
          usageMigrated?: boolean;
          projectsExportV1Migrated?: boolean;
          usageExportV1Migrated?: boolean;
        };
        if (disposed) return;

        const projectsReady = Boolean(status.projectsExportV1Migrated || status.projectsMigrated);
        const usageReady = Boolean(status.usageExportV1Migrated || status.usageMigrated);

        setProjectsDone(projectsReady);
        setUsageDone(usageReady);

        if (projectsReady && usageReady) {
          onComplete();
          return;
        }
      } catch {
        // daemon not ready yet, retry
      }

      if (!disposed) {
        setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      disposed = true;
    };
  }, [onComplete]);

  return (
    <AppBackgroundContainer>
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box
          component="header"
          className="electron-webkit-app-region-drag"
          data-testid="migration-topbar"
          sx={{
            height: 42,
            minHeight: 42,
            px: 1,
            display: "flex",
            alignItems: "center",
            borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        />
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            px: { xs: 2, sm: 4 },
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Stack
            spacing={2}
            sx={{
              width: "100%",
              maxWidth: 540,
              p: { xs: 1, sm: 1.5 },
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                mb: 0.5,
              }}
            >
              <Box
                component="img"
                src={yishanLogo}
                alt=""
                sx={{
                  width: 210,
                  height: "auto",
                  opacity: 0.2,
                }}
              />
            </Box>
            <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 2.4 }}>
              SYNCING
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Setting up your workspace for the first time…
            </Typography>

            <Stack spacing={1.5} sx={{ width: "100%", maxWidth: 300, mt: 2 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                {projectsDone ? (
                  <Typography variant="caption" sx={{ color: "success.main" }}>✓</Typography>
                ) : (
                  <CircularProgress size={14} />
                )}
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Projects & workspaces
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                {usageDone ? (
                  <Typography variant="caption" sx={{ color: "success.main" }}>✓</Typography>
                ) : (
                  <CircularProgress size={14} />
                )}
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Token usage history
                </Typography>
              </Stack>
            </Stack>
          </Stack>
        </Box>
      </Box>
    </AppBackgroundContainer>
  );
}
