import { Box, Dialog, IconButton, Tooltip, Typography } from "@mui/material";
import { LuMinus, LuPlus, LuShrink, LuX } from "react-icons/lu";
import { ZOOM_MAX, ZOOM_MIN, useDiagramPanZoom } from "../hooks/useDiagramPanZoom";

type DiagramZoomOverlayProps = {
  /** Rendered SVG markup string to display. */
  svgContent: string;
  /** Called when the user closes the overlay (X button or Escape key). */
  onClose: () => void;
};

/**
 * Full-screen overlay that renders a mermaid SVG with pan and zoom support.
 *
 * - Zoom: scroll wheel, trackpad pinch (fires as wheel+ctrlKey), or toolbar +/− buttons.
 * - Pan: click-and-drag anywhere on the canvas.
 * - Reset: toolbar reset button returns to 1× centered.
 * - Close: toolbar X button or Escape key (MUI Dialog handles Escape natively).
 *
 * State is fully local — resets to defaults on each mount (each open).
 */
export function DiagramZoomOverlay({ svgContent, onClose }: DiagramZoomOverlayProps) {
  const {
    scale,
    translate,
    zoomPercent,
    svgCallbackRef,
    canvasCallbackRef,
    handleMouseDown,
    handleMouseMove,
    stopDrag,
    handleZoomIn,
    handleZoomOut,
    handleReset,
  } = useDiagramPanZoom(svgContent);


  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: "80vw",
            height: "80vh",
            maxWidth: "none",
            maxHeight: "none",
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.default",
            overflow: "hidden",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Toolbar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1.5,
            py: 0.75,
            borderBottom: 1,
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              flex: 1,
            }}
          >
            Diagram
          </Typography>

          <Tooltip title="Zoom out">
            <span>
              <IconButton
                aria-label="Zoom out"
                onClick={handleZoomOut}
                disabled={scale <= ZOOM_MIN}
                sx={{ p: 0.375, color: "text.secondary" }}
              >
                <LuMinus size={14} />
              </IconButton>
            </span>
          </Tooltip>

          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              minWidth: 40,
              textAlign: "center",
              userSelect: "none",
            }}
          >
            {zoomPercent}
          </Typography>

          <Tooltip title="Zoom in">
            <span>
              <IconButton
                aria-label="Zoom in"
                onClick={handleZoomIn}
                disabled={scale >= ZOOM_MAX}
                sx={{ p: 0.375, color: "text.secondary" }}
              >
                <LuPlus size={14} />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Reset zoom">
            <span>
              <IconButton
                aria-label="Reset zoom"
                onClick={handleReset}
                disabled={scale === 1 && translate.x === 0 && translate.y === 0}
                sx={{ p: 0.375, color: "text.secondary" }}
              >
                <LuShrink size={14} />
              </IconButton>
            </span>
          </Tooltip>

          <Box sx={{ width: "1px", height: 14, bgcolor: "divider", mx: 0.5 }} />

          <Tooltip title="Close">
            <IconButton onClick={onClose} sx={{ p: 0.375, color: "text.secondary" }}>
              <LuX size={14} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Canvas */}
        <Box
          ref={canvasCallbackRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          sx={{
            flex: 1,
            overflow: "hidden",
            userSelect: "none",
            cursor: "grab",
            "&:active": { cursor: "grabbing" },
          }}
        >
          <Box
            sx={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box
              ref={svgCallbackRef}
              sx={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: "center center",
                lineHeight: 0,
                "& svg": {
                  display: "block",
                  width: "100%",
                  height: "100%",
                  maxWidth: "calc(80vw - 48px)",
                  maxHeight: "calc(80vh - 80px)",
                },
              }}
            />
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
