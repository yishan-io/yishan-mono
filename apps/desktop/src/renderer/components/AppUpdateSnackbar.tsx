import { Box, Button, IconButton, Paper, Slide, Snackbar, Stack, Typography } from "@mui/material";
import type { SlideProps } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopUpdateEventPayload } from "../../main/ipc";
import { getDesktopBridge, getDesktopHostBridge } from "../rpc/rpcTransport";

function isDesktopUpdateReadyPayload(value: unknown): value is DesktopUpdateEventPayload {
  return (
    !value ||
    (typeof value === "object" &&
      (!("version" in value) || typeof (value as { version?: unknown }).version === "string"))
  );
}

function SlideTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

/** Shows a bottom-right in-app prompt when a downloaded desktop update is ready to install. */
export function AppUpdateSnackbar() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<DesktopUpdateEventPayload | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    let disposed = false;
    const bridge = getDesktopBridge();
    if (bridge) {
      void bridge.host
        .getPendingUpdate()
        .then((pendingUpdate) => {
          if (!disposed && pendingUpdate) {
            setUpdate(pendingUpdate);
          }
        })
        .catch((error: unknown) => {
          if (import.meta.env.DEV) {
            console.debug("[AppUpdateSnackbar] failed to load pending update", error);
          }
        });
    }

    const unsubscribe = bridge?.events.subscribe((event) => {
      if (event.method !== "desktopUpdateReady" || !isDesktopUpdateReadyPayload(event.payload)) {
        return;
      }

      setUpdate(event.payload ?? {});
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const versionLabel = update?.version?.trim();
  const title = versionLabel
    ? t("app.update.readyTitleWithVersion", { version: versionLabel })
    : t("app.update.readyTitle");

  return (
    <Snackbar
      open={Boolean(update)}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      slots={{ transition: SlideTransition }}
    >
      <Paper
        component="output"
        elevation={8}
        aria-live="polite"
        sx={{
          display: "block",
          width: 360,
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: "divider",
        }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("app.update.readyDescription")}
              </Typography>
            </Box>
            <IconButton
              aria-label={t("app.update.closeAria")}
              size="small"
              onClick={() => {
                setUpdate(null);
              }}
              sx={{ mt: -0.5, mr: -0.5 }}
            >
              ×
            </IconButton>
          </Box>
          <Box>
            <Button
              variant="contained"
              size="small"
              disabled={isInstalling}
              onClick={() => {
                setIsInstalling(true);
                void getDesktopHostBridge()
                  .installUpdate()
                  .catch((error: unknown) => {
                    setIsInstalling(false);
                    if (import.meta.env.DEV) {
                      console.debug("[AppUpdateSnackbar] failed to install update", error);
                    }
                  });
              }}
            >
              {t("app.update.restartAction")}
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Snackbar>
  );
}
