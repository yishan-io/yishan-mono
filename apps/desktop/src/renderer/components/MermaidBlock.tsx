import { Box, Typography, useTheme } from "@mui/material";
import { memo, useEffect, useId, useRef, useState } from "react";
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
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
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
          bgcolor: (t) =>
            t.palette.mode === "dark" ? "rgba(211, 47, 47, 0.08)" : "rgba(211, 47, 47, 0.04)",
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
      ref={containerRef}
      sx={{
        my: 1.5,
        display: "flex",
        justifyContent: "center",
        overflow: "auto",
        "& svg": {
          maxWidth: "100%",
          height: "auto",
        },
      }}
    />
  );
});

export { MermaidBlock };
