import { Box, Typography } from "@mui/material";
import { getFileName } from "@shared/path/paths";
import { useCallback, useState } from "react";
import { PiMusicNotesThin, PiWarningThin } from "react-icons/pi";
import { FileViewerToolbar } from "./FileViewerToolbar";

type AudioPreviewProps = {
  path: string;
  dataUrl: string;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

/** Renders an audio player with a waveform placeholder and standard playback controls. */
export function AudioPreview({
  path,
  dataUrl,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: AudioPreviewProps) {
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
          <Typography variant="h6">Unable to play audio</Typography>
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
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            px: 3,
          }}
        >
          <PiMusicNotesThin size={88} color="currentColor" style={{ opacity: 0.32 }} />
          <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
            {fileName}
          </Typography>
          <Box
            component="audio"
            src={dataUrl}
            controls
            preload="metadata"
            aria-label={fileName}
            onError={handleError}
            sx={{
              width: "100%",
              maxWidth: 480,
            }}
          />
        </Box>
      )}
    </Box>
  );
}
