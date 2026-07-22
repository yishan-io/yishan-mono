import { Box, Button, IconButton, LinearProgress, Paper, Slide, Snackbar, Stack, Typography } from "@mui/material";
import type { SlideProps } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopUpdateEventPayload } from "../../main/ipc";
import { getDesktopBridge, getDesktopHostBridge } from "../rpc/rpcTransport";

function isDesktopUpdatePayload(value: unknown): value is DesktopUpdateEventPayload {
  return Boolean(value && typeof value === "object" && "status" in value);
}

function SlideTransition(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

function resolveUpdateTitle(input: {
  update: DesktopUpdateEventPayload | null;
  versionLabel: string | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
}): string {
  const { update, versionLabel, t } = input;

  switch (update?.status) {
    case "checking":
      return t("app.update.checkingTitle");
    case "not-available":
      return t("app.update.upToDateTitle");
    case "error":
      return t("app.update.errorTitle");
    case "downloading":
      return t("app.update.downloadingTitle");
    case "downloaded":
      return versionLabel
        ? t("app.update.readyTitleWithVersion", { version: versionLabel })
        : t("app.update.readyTitle");
    case "available":
      return versionLabel
        ? t("app.update.availableTitleWithVersion", { version: versionLabel })
        : t("app.update.availableTitle");
    default:
      return t("app.update.availableTitle");
  }
}

function resolveUpdateDescription(input: {
  update: DesktopUpdateEventPayload | null;
  t: (key: string) => string;
}): string {
  const { update, t } = input;

  switch (update?.status) {
    case "checking":
      return t("app.update.checkingDescription");
    case "not-available":
      return t("app.update.upToDateDescription");
    case "error":
      return update.message;
    case "downloading":
      return t("app.update.downloadingDescription");
    case "downloaded":
      return t("app.update.readyDescription");
    case "available":
      return t("app.update.availableDescription");
    default:
      return t("app.update.availableDescription");
  }
}

/** Shows a bottom-right in-app prompt for the full desktop update flow. */
export function AppUpdateSnackbar() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<DesktopUpdateEventPayload | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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
      if (event.method !== "desktopUpdate" || !isDesktopUpdatePayload(event.payload)) {
        return;
      }

      setUpdate(event.payload);
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const versionLabel = update && "version" in update ? update.version?.trim() : undefined;
  const title = resolveUpdateTitle({ update, versionLabel, t });
  const description = resolveUpdateDescription({ update, t });
  const progressValue = update?.status === "downloading" ? Math.max(0, Math.min(100, update.percent ?? 0)) : 0;
  const shouldDismissAutoUpdate = update?.status === "available" && update.source === "auto";

  const handleClose = () => {
    if (shouldDismissAutoUpdate) {
      // fire-and-forget: dismissal only needs best-effort persistence in the main process.
      void getDesktopHostBridge().dismissUpdate();
    }

    setUpdate(null);
  };

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
                {description}
              </Typography>
            </Box>
            <IconButton aria-label={t("app.update.closeAria")} onClick={handleClose} sx={{ mt: -0.5, mr: -0.5 }}>
              ×
            </IconButton>
          </Box>
          {update?.status === "downloading" ? (
            <Box>
              <LinearProgress
                variant={update.percent === undefined ? "indeterminate" : "determinate"}
                value={progressValue}
                sx={{ height: 8, borderRadius: 999 }}
              />
              {update.percent !== undefined ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  {t("app.update.downloadProgress", { percent: Math.round(progressValue) })}
                </Typography>
              ) : null}
            </Box>
          ) : null}
          {update?.status === "available" || update?.status === "downloaded" ? (
            <Button
              variant="contained"
              size="small"
              disabled={isBusy}
              onClick={() => {
                setIsBusy(true);
                const request =
                  update.status === "downloaded"
                    ? getDesktopHostBridge().installUpdate()
                    : getDesktopHostBridge().downloadUpdate();
                void request
                  .then((result) => {
                    if ("ok" in result && !result.ok) {
                      setUpdate({ status: "error", source: "download", message: result.error });
                    }
                  })
                  .catch((error: unknown) => {
                    setUpdate({
                      status: "error",
                      source: "download",
                      message: error instanceof Error ? error.message : t("app.update.downloadFailed"),
                    });
                    if (import.meta.env.DEV) {
                      console.debug("[AppUpdateSnackbar] update action failed", error);
                    }
                  })
                  .finally(() => {
                    setIsBusy(false);
                  });
              }}
            >
              {update.status === "downloaded" ? t("app.update.restartAction") : t("app.update.downloadAction")}
            </Button>
          ) : null}
        </Stack>
      </Paper>
    </Snackbar>
  );
}
