import { Box, Typography, useTheme } from "@mui/material";
import { memo, useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

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

/** Tracks whether mermaid has been initialized for the current theme mode. */
let lastInitializedTheme: "dark" | "light" | null = null;

/** Initializes mermaid only when the theme mode actually changes. */
function ensureMermaidInitialized(isDark: boolean, fontFamily: string): void {
  const targetTheme = isDark ? "dark" : "light";
  if (lastInitializedTheme === targetTheme) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    themeVariables: isDark
      ? {
          primaryColor: "#3f51b5",
          primaryTextColor: "#e0e0e0",
          primaryBorderColor: "#5c6bc0",
          lineColor: "#7986cb",
          secondaryColor: "#1a237e",
          tertiaryColor: "#283593",
          background: "#121212",
          mainBkg: "#1e1e1e",
          nodeBorder: "#5c6bc0",
          clusterBkg: "#1a1a2e",
          titleColor: "#e0e0e0",
          edgeLabelBackground: "#2d2d2d",
        }
      : undefined,
    fontFamily,
    fontSize: 14,
  });

  lastInitializedTheme = targetTheme;
}

/**
 * Renders a Mermaid diagram from a code string, with theme-aware styling and error handling.
 *
 * Performance optimizations:
 * - Per-component SVG cache: skips mermaid.render() when code+theme haven't changed.
 * - Memoized with React.memo: skips re-render when parent updates but props are identical.
 * - Mermaid.initialize() called only on theme change, not every render.
 */
const MermaidBlock = memo(function MermaidBlock({ code }: MermaidBlockProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, "-");
  const isDark = theme.palette.mode === "dark";

  // Per-component cache: stores last successful render to avoid redundant mermaid.render() calls.
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
      ensureMermaidInitialized(isDark, theme.typography.fontFamily as string);

      const diagramId = `mermaid-${uniqueId}-${Date.now()}`;

      try {
        const { svg } = await mermaid.render(diagramId, trimmedCode);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          cachedRenderRef.current = { key: cacheKey, svg };
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          // Clean up any leftover error element mermaid may have inserted
          const errorElement = document.getElementById(`d${diagramId}`);
          errorElement?.remove();

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
  }, [code, isDark, uniqueId, theme.typography.fontFamily]);

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
