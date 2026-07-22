import { Box, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import { DiagramZoomOverlay } from "@renderer/components/DiagramZoomOverlay";
import { memo, useEffect, useRef, useState } from "react";
import { LuMaximize2 } from "react-icons/lu";
import { mermaidIframeRenderer } from "./mermaidIframeRenderer";

type MermaidBlockProps = {
  code: string;
};

type CachedMermaidRender = {
  /** Cache key: `${code}\0${themeMode}` */
  key: string;
  /** Rendered SVG markup */
  svg: string;
};

/** Builds one stable cache key from diagram code and theme mode. */
function buildMermaidCacheKey(code: string, isDark: boolean): string {
  return `${code.trim()}\0${isDark ? "dark" : "light"}`;
}

/**
 * Renders a Mermaid diagram from a code string, with theme-aware styling and error handling.
 *
 * Performance optimizations:
 * - Renders in a hidden iframe so mermaid's layout engine does not block the main thread.
 * - Per-component SVG cache: skips render when code+theme haven't changed.
 * - Memoized with React.memo: skips re-render when parent updates but props are identical.
 */
const MermaidBlock = memo(function MermaidBlock({ code }: MermaidBlockProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const isDark = theme.palette.mode === "dark";

  // Per-component cache: stores last successful render to avoid redundant render calls.
  const cachedRenderRef = useRef<CachedMermaidRender | null>(null);

  useEffect(() => {
    const trimmedCode = code.trim();
    if (!containerRef.current || !trimmedCode) return;

    const cacheKey = buildMermaidCacheKey(trimmedCode, isDark);

    // Skip render if code+theme haven't changed — reuse cached SVG.
    if (cachedRenderRef.current?.key === cacheKey) {
      containerRef.current.innerHTML = cachedRenderRef.current.svg;
      setSvgContent(cachedRenderRef.current.svg);
      setError(null);
      return;
    }

    let cancelled = false;

    const renderDiagram = async () => {
      try {
        const svg = await mermaidIframeRenderer.render(trimmedCode, {
          isDark,
          fontFamily: theme.typography.fontFamily as string,
        });

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          cachedRenderRef.current = { key: cacheKey, svg };
          setSvgContent(svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
          setSvgContent(null);
          // Clear cache on error so next attempt with same code retries rendering.
          cachedRenderRef.current = null;
        }
      }
    };

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, isDark, theme.typography.fontFamily]);

  if (!code.trim()) {
    return null;
  }

  if (error) {
    return (
      <Box
        sx={{
          my: 1.5,
          p: 2,
          borderRadius: 1,
          border: 1,
          borderColor: "error.main",
          bgcolor: (t) => (t.palette.mode === "dark" ? "rgba(211, 47, 47, 0.08)" : "rgba(211, 47, 47, 0.04)"),
        }}
      >
        <Typography variant="caption" color="error.main" sx={{ fontWeight: 500 }}>
          Mermaid diagram error
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mt: 0.5,
            fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
            fontSize: "0.75em",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: "relative",
        my: 1.5,
        "&:hover .diagram-expand-btn": { opacity: 1 },
      }}
    >
      <Box
        ref={containerRef}
        sx={{
          display: "flex",
          justifyContent: "center",
          overflow: "auto",
          "& svg": {
            maxWidth: "100%",
            height: "auto",
          },
        }}
      />
      <Tooltip title="Expand diagram">
        <span>
          <IconButton
            className="diagram-expand-btn"
            onClick={() => setOverlayOpen(true)}
            disabled={!svgContent}
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              opacity: 0,
              transition: "opacity 0.15s",
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              "&:hover": { bgcolor: "action.hover" },
              p: 0.5,
            }}
          >
            <LuMaximize2 size={14} />
          </IconButton>
        </span>
      </Tooltip>
      {overlayOpen && svgContent && (
        <DiagramZoomOverlay svgContent={svgContent} onClose={() => setOverlayOpen(false)} />
      )}
    </Box>
  );
});

export { MermaidBlock };
