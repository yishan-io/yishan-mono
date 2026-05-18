import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { MONOSPACE_SX } from "../../helpers/styles";
import { useDialogRegistration } from "../../hooks/useDialogRegistration";
import { workspaceLifecycleNoticeStore } from "../../store/workspaceLifecycleNoticeStore";

/** Renders in-app snackbar and detail dialog for lifecycle script warnings. */
export function WorkspaceLifecycleNoticeView() {
  const activeNotice = workspaceLifecycleNoticeStore((state) => state.noticeQueue[0] ?? null);
  const detailNotice = workspaceLifecycleNoticeStore((state) => state.detailNotice);
  const dismissActiveNotice = workspaceLifecycleNoticeStore((state) => state.dismissActiveNotice);
  const openActiveNoticeDetails = workspaceLifecycleNoticeStore((state) => state.openActiveNoticeDetails);
  const closeDetailNotice = workspaceLifecycleNoticeStore((state) => state.closeDetailNotice);
  useDialogRegistration(Boolean(detailNotice));

  const activeScriptLabel =
    activeNotice?.kind === "lifecycle" && activeNotice.warning.scriptKind === "setup" ? "setup" : "post";
  const activeTitle =
    activeNotice?.kind === "error" ? activeNotice.title : `Workspace ${activeScriptLabel} script failed`;
  const activeMessage =
    activeNotice?.kind === "error"
      ? activeNotice.message
      : activeNotice
        ? `${activeNotice.workspaceName}: ${activeNotice.warning.message}`
        : "";

  return (
    <>
      <Snackbar
        open={Boolean(activeNotice)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        autoHideDuration={12_000}
        onClose={() => {
          dismissActiveNotice();
        }}
      >
        <Alert
          severity={activeNotice?.kind === "error" ? "error" : "warning"}
          sx={{ alignItems: "center", minWidth: 380 }}
          action={
            <Stack direction="row" spacing={0.5}>
              {activeNotice?.kind === "lifecycle" ? (
                <Button color="inherit" size="small" onClick={openActiveNoticeDetails}>
                  View output
                </Button>
              ) : null}
              <Button color="inherit" size="small" onClick={dismissActiveNotice}>
                Dismiss
              </Button>
            </Stack>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {activeTitle}
          </Typography>
          <Typography variant="caption" sx={{ display: "block" }}>
            {activeMessage}
          </Typography>
        </Alert>
      </Snackbar>

      <Dialog
        open={Boolean(detailNotice)}
        onClose={closeDetailNotice}
        fullWidth
        maxWidth="md"
        aria-labelledby="workspace-lifecycle-warning-dialog-title"
      >
        <DialogTitle id="workspace-lifecycle-warning-dialog-title">Workspace script output</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography variant="body2">
              <strong>Workspace:</strong> {detailNotice?.workspaceName}
            </Typography>
            <Typography variant="body2">
              <strong>Kind:</strong> {detailNotice?.warning.scriptKind}
            </Typography>
            <Typography variant="body2">
              <strong>Command:</strong> {detailNotice?.warning.command}
            </Typography>
            <Typography variant="body2">
              <strong>Exit code:</strong> {detailNotice?.warning.exitCode ?? "null"}
            </Typography>
            <Typography variant="body2">
              <strong>Signal:</strong> {detailNotice?.warning.signal ?? "null"}
            </Typography>
            <Typography variant="body2">
              <strong>Timed out:</strong> {detailNotice?.warning.timedOut ? "yes" : "no"}
            </Typography>
            <Typography variant="body2">
              <strong>Log file:</strong> {detailNotice?.warning.logFilePath ?? "(not available)"}
            </Typography>
            <Typography variant="subtitle2">stderr</Typography>
            <Typography
              component="pre"
              variant="caption"
              sx={{
                m: 0,
                p: 1.25,
                borderRadius: 1,
                bgcolor: "action.hover",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...MONOSPACE_SX,
              }}
            >
              {detailNotice?.warning.stderrExcerpt || "(empty)"}
            </Typography>
            <Typography variant="subtitle2">stdout</Typography>
            <Typography
              component="pre"
              variant="caption"
              sx={{
                m: 0,
                p: 1.25,
                borderRadius: 1,
                bgcolor: "action.hover",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...MONOSPACE_SX,
              }}
            >
              {detailNotice?.warning.stdoutExcerpt || "(empty)"}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDetailNotice}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
