import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useCallback, useState } from "react";
import { LuMaximize2, LuMinus, LuPlus } from "react-icons/lu";
import { getFileName } from "../store/tabs";
import { FileViewerToolbar } from "./FileViewerToolbar";

type ImagePreviewProps = {
  path: string;
  dataUrl: string;
  onCopyPath?: (path: string) => void | Promise<void>;
  onOpenExternalApp?: (path: string) => void | Promise<void>;
  openExternalAppLabel?: string;
};

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;
const ZOOM_FIT = 0;

/** Renders a centered, fit-to-view image preview with zoom toolbar. */
export function ImagePreview({
  path,
  dataUrl,
  onCopyPath,
  onOpenExternalApp,
  openExternalAppLabel = "Open in external app",
}: ImagePreviewProps) {
  const fileName = getFileName(path);
  // zoom === ZOOM_FIT means "fit to view" (auto-scale); any positive value is a manual scale factor.
  const [zoom, setZoom] = useState<number>(ZOOM_FIT);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const base = prev === ZOOM_FIT ? 1 : prev;
      return Math.min(base + ZOOM_STEP, ZOOM_MAX);
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const base = prev === ZOOM_FIT ? 1 : prev;
      const next = base - ZOOM_STEP;
      return next <= ZOOM_MIN ? ZOOM_MIN : next;
    });
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoom(ZOOM_FIT);
  }, []);

  const isFitToView = zoom === ZOOM_FIT;
  const zoomPercent = isFitToView ? "Fit" : `${Math.round(zoom * 100)}%`;

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
        actions={
          <>
            <Tooltip title="Zoom out">
              <span>
                <IconButton
                  size="small"
                  onClick={handleZoomOut}
                  disabled={!isFitToView && zoom <= ZOOM_MIN}
                  sx={{ p: 0.375, color: "text.secondary" }}
                >
                  <LuMinus size={14} />
                </IconButton>
              </span>
            </Tooltip>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: 36, textAlign: "center", userSelect: "none" }}
            >
              {zoomPercent}
            </Typography>
            <Tooltip title="Zoom in">
              <span>
                <IconButton
                  size="small"
                  onClick={handleZoomIn}
                  disabled={zoom >= ZOOM_MAX}
                  sx={{ p: 0.375, color: "text.secondary" }}
                >
                  <LuPlus size={14} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Fit to view">
              <span>
                <IconButton
                  size="small"
                  onClick={handleZoomFit}
                  disabled={isFitToView}
                  sx={{ p: 0.375, color: "text.secondary" }}
                >
                  <LuMaximize2 size={14} />
                </IconButton>
              </span>
            </Tooltip>
            <Box sx={{ width: "1px", height: 14, bgcolor: "divider", mx: 0.5 }} />
          </>
        }
      />

      {/* Image canvas */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "auto",
          p: 2,
          // Subtle checkerboard to visualize transparent images
          backgroundImage:
            "linear-gradient(45deg, #80808020 25%, transparent 25%), " +
            "linear-gradient(-45deg, #80808020 25%, transparent 25%), " +
            "linear-gradient(45deg, transparent 75%, #80808020 75%), " +
            "linear-gradient(-45deg, transparent 75%, #80808020 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      >
        <Box
          component="img"
          src={dataUrl}
          alt={fileName}
          sx={
            isFitToView
              ? {
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  userSelect: "none",
                  pointerEvents: "none",
                }
              : {
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  userSelect: "none",
                  pointerEvents: "none",
                }
          }
        />
      </Box>
    </Box>
  );
}
