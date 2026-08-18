import { Box, Typography } from "@mui/material";
import { PiCubeThin } from "react-icons/pi";
import { FileViewerToolbar } from "./FileViewerToolbar";

type UnsupportedFileViewProps = {
  path: string;
  title: string;
  description: string;
  hint?: string;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

/** Renders one centered empty-state for unsupported editor file types. */
export function UnsupportedFileView({
  path,
  title,
  description,
  hint,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: UnsupportedFileViewProps) {
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
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          px: 3,
          textAlign: "center",
        }}
      >
        <PiCubeThin size={88} color="currentColor" style={{ opacity: 0.32 }} />
        <Typography variant="h6">{title}</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {description}
        </Typography>
        {hint ? (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
            {hint}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
