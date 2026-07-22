import { Box, Dialog, IconButton, Tooltip, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuMinus, LuPlus, LuShrink, LuX } from "react-icons/lu";

type DiagramZoomOverlayProps = {
  /** Rendered SVG markup string to display. */
  svgContent: string;
  /** Called when the user closes the overlay (X button or Escape key). */
  onClose: () => void;
};

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;

/**
 * Injects an SVG string into a container div and normalises its sizing.
 *
 * Mermaid output varies:
 * - Some diagrams have explicit `width`/`height` px attributes (from the 800×600 iframe).
 * - Others rely solely on `viewBox` with no width/height at all, which makes browsers
 *   render at the default 300×150 intrinsic size.
 *
 * Strategy: always remove explicit px attributes and set `width`/`height` from the
 * viewBox aspect ratio so CSS `maxWidth`/`maxHeight` can scale it correctly.
 */
function injectSvg(container: HTMLDivElement, svgContent: string): void {
  container.innerHTML = svgContent;
  const svg = container.querySelector("svg");
  if (!svg) return;

  // Remove any hardcoded pixel dimensions mermaid may have stamped.
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.removeProperty("max-width");

  // If the SVG has a viewBox, derive a percentage-based width/height so the
  // browser knows the aspect ratio and CSS max-* rules can scale it properly.
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/);
    const vbWidth = Number.parseFloat(parts[2] ?? "0");
    const vbHeight = Number.parseFloat(parts[3] ?? "0");
    if (vbWidth > 0 && vbHeight > 0) {
      svg.setAttribute("width", String(vbWidth));
      svg.setAttribute("height", String(vbHeight));
    }
  }
}

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
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Drag state tracked in refs to avoid stale-closure issues inside mousemove.
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateAtDragStart = useRef({ x: 0, y: 0 });

  // Ref for the SVG content container (innerHTML target).
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  // Ref for the canvas Box — used to attach a non-passive wheel listener.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Stored so the listener can be removed on unmount (null call from React).
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);

  // Ref callback: fires synchronously when the element is attached to the DOM.
  const svgCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      svgContainerRef.current = node;
      if (!node) return;
      injectSvg(node, svgContent);
    },
    [svgContent],
  );

  // Re-inject when svgContent changes after mount (theme switch, code update).
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;
    injectSvg(container, svgContent);
  }, [svgContent]);

  // Attach a non-passive wheel listener via ref callback so it is wired as soon
  // as the element is in the DOM (avoids portal timing issues with useEffect).
  // Two gesture types share this handler:
  //   - Plain scroll (ctrlKey=false): flat ±ZOOM_STEP per event tick.
  //   - Trackpad pinch (ctrlKey=true): Electron fires proportional deltaY values
  //     (e.g. -3.5 … +12.0). Use a sensitivity factor so the gesture feels natural.
  const canvasCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Remove previous listener before reassigning (handles unmount null call).
    if (canvasRef.current && wheelHandlerRef.current) {
      canvasRef.current.removeEventListener("wheel", wheelHandlerRef.current);
      wheelHandlerRef.current = null;
    }

    canvasRef.current = node;
    if (!node) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      let delta: number;
      if (e.ctrlKey) {
        // Pinch gesture: deltaY is proportional to pinch speed. Scale it down
        // so a typical two-finger pinch maps to a reasonable zoom range.
        delta = -(e.deltaY / 100) * 0.8;
      } else {
        // Plain scroll wheel: one fixed step per tick.
        delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      }
      setScale((s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s + delta)));
    };

    wheelHandlerRef.current = handleWheel;
    node.addEventListener("wheel", handleWheel, { passive: false });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateAtDragStart.current = { ...translate };
    },
    [translate],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setTranslate({
      x: translateAtDragStart.current.x + (e.clientX - dragStart.current.x),
      y: translateAtDragStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, []);

  const stopDrag = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const zoomPercent = `${Math.round(scale * 100)}%`;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
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
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
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
            color="text.secondary"
            sx={{ minWidth: 40, textAlign: "center", userSelect: "none" }}
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
