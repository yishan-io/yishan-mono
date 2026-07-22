import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { LuCopy, LuExternalLink } from "react-icons/lu";
import { getFileTreeIcon } from "./fileTreeIcons";

export type FileViewerToolbarProps = {
  /** Relative file path displayed as a caption in the toolbar. */
  path: string;
  /** Whether to show the file type icon before the path. Defaults to true. */
  showFileIcon?: boolean;
  /** Optional extra content rendered between the path and the copy/external-app buttons. */
  statusContent?: ReactNode;
  /** Optional extra controls rendered in the right-side actions area (e.g., zoom, view-mode toggles). */
  actions?: ReactNode;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

/**
 * Renders a standardized toolbar bar for file viewer components (editor, image
 * preview, diff viewer, unsupported file view).
 *
 * Provides the consistent 34px height, horizontal padding, bottom border,
 * theme-aware background, file icon, path label, and copy/open-external
 * action buttons that were previously duplicated across `FileEditor`,
 * `ImagePreview`, and `UnsupportedFileView`.
 *
 * @example
 * ```tsx
 * <FileViewerToolbar
 *   path={tab.data.path}
 *   onCopyPath={copyToClipboard}
 *   onOpenExternalApp={handleOpenExternalApp}
 *   openExternalAppLabel="Open in VS Code"
 *   actions={<ZoomControls />}
 * />
 * ```
 */
export function FileViewerToolbar({
  path,
  showFileIcon = true,
  statusContent,
  actions,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: FileViewerToolbarProps) {
  const fileIcon = useMemo(() => (showFileIcon ? getFileTreeIcon(path, false) : null), [path, showFileIcon]);

  return (
    <Box
      sx={{
        minHeight: 34,
        px: 1.5,
        borderBottom: 1,
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        bgcolor: (muiTheme) =>
          muiTheme.palette.mode === "dark" ? "background.default" : muiTheme.palette.background.paper,
      }}
    >
      {fileIcon ? (
        <Box component="img" src={fileIcon} alt="" sx={{ width: 14, height: 14, mr: 0.75, flexShrink: 0 }} />
      ) : null}
      <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0, flex: 1 }}>
        {path}
      </Typography>
      {statusContent}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, ml: 0.75, flexShrink: 0 }}>
        {actions}
        <Tooltip title="Copy file path">
          <span>
            <IconButton
              aria-label="Copy file path"
              onClick={() => {
                void onCopyPath?.(path);
              }}
              disabled={!onCopyPath}
              sx={{ p: 0.375, color: "text.secondary" }}
            >
              <LuCopy size={14} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={openExternalAppLabel}>
          <span>
            <IconButton
              aria-label={openExternalAppLabel}
              onClick={() => {
                void onOpenExternalApp?.(path);
              }}
              disabled={!onOpenExternalApp}
              sx={{ p: 0.375, color: "text.secondary" }}
            >
              <LuExternalLink size={14} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
