import { Alert, Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import { CenteredSpinner } from "@renderer/components/CenteredSpinner";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { LuX } from "react-icons/lu";

type LogEntry = Record<string, unknown> & {
  _raw?: string;
};

type DaemonLogDialogState = {
  close: () => void;
  entries: LogEntry[];
  error: string | null;
  handleScroll: () => void;
  isLoading: boolean;
  isOpen: boolean;
  logContainerRef: RefObject<HTMLDivElement | null>;
};

type DaemonLogDialogProps = {
  state: DaemonLogDialogState;
};

function getLogMessage(entry: LogEntry) {
  if (typeof entry.message === "string") {
    return entry.message;
  }
  if (entry._raw) {
    return String(entry._raw);
  }
  return JSON.stringify(entry);
}

function getLogMetadata(entry: LogEntry) {
  return Object.entries(entry)
    .filter(([key]) => key !== "level" && key !== "time" && key !== "message" && key !== "_raw")
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("  ");
}

function getLogLevelColor(level: string | undefined): "default" | "error" | "info" | "warning" {
  if (level === "error" || level === "fatal") {
    return "error";
  }
  if (level === "warn") {
    return "warning";
  }
  if (level === "debug" || level === "trace") {
    return "default";
  }
  return "info";
}

/** Renders the daemon log dialog and formatted log entries. */
export function DaemonLogDialog(props: DaemonLogDialogProps) {
  const { t } = useTranslation();
  const { state } = props;

  return (
    <Dialog open={state.isOpen} onClose={state.close} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {t("settings.daemon.log.title")}
        <IconButton size="small" onClick={state.close}>
          <LuX />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {state.isLoading ? (
          <CenteredSpinner />
        ) : state.error ? (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">{state.error}</Alert>
          </Box>
        ) : (
          <Box
            ref={state.logContainerRef}
            sx={{ maxHeight: "60vh", overflow: "auto", p: 1 }}
            onScroll={state.handleScroll}
          >
            {state.entries.map((entry, index) => {
              const level = typeof entry.level === "string" ? entry.level : undefined;
              const time = typeof entry.time === "string" ? entry.time : undefined;
              const message = getLogMessage(entry);
              const metadata = getLogMetadata(entry);
              const formattedTime = time ? new Date(time).toLocaleString() : undefined;
              const entryKey = `${index}-${time ?? ""}-${level ?? ""}-${message.slice(0, 40)}`;

              return (
                <Box
                  key={entryKey}
                  sx={{
                    display: "flex",
                    gap: 1,
                    py: 0.25,
                    px: 1,
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    alignItems: "flex-start",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  {formattedTime ? (
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "monospace",
                        whiteSpace: "nowrap",
                        color: "text.secondary",
                        flexShrink: 0,
                        minWidth: 140,
                        pt: "2px",
                      }}
                    >
                      {formattedTime}
                    </Typography>
                  ) : null}
                  {level ? (
                    <Chip
                      label={level.toUpperCase()}
                      size="small"
                      color={getLogLevelColor(level)}
                      sx={{ height: 20, fontSize: "0.65rem", flexShrink: 0, mt: "1px" }}
                    />
                  ) : null}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        lineHeight: 1.4,
                      }}
                    >
                      {message}
                    </Typography>
                    {metadata ? (
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                          color: "text.disabled",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                          display: "block",
                        }}
                      >
                        {metadata}
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
