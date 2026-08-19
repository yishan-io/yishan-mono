import { Box, Typography } from "@mui/material";
import { getFileName } from "@shared/path/paths";
import { useCallback, useState } from "react";
import { PiWarningThin } from "react-icons/pi";
import { FileViewerToolbar } from "./FileViewerToolbar";

type VideoPreviewProps = {
  path: string;
  dataUrl: string;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

/** Renders a centered video player with standard playback controls. */
export function VideoPreview({
  path,
  dataUrl,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: VideoPreviewProps) {
  const fileName = getFileName(path);
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <FileViewerToolbar
        path={path}
        onCopyPath={onCopyPath}
        onOpenExternalApp={onOpenExternalApp}
        openExternalAppLabel={openExternalAppLabel}
      />
      {hasError ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.5,
            px: 3,
            textAlign: "center",
          }}
        >
          <PiWarningThin size={88} color="currentColor" style={{ opacity: 0.32 }} />
          <Typography variant="h6">Unable to play video</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {fileName}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            The file may use an unsupported codec or be corrupted.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
            p: 2,
            bgcolor: "#000",
          }}
        >
          <Box
            component="video"
            src={dataUrl}
            controls
            preload="metadata"
            aria-label={fileName}
            onError={handleError}
            sx={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        </Box>
      )}
    </Box>
  );
}
