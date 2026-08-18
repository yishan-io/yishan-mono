import { Excalidraw } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ParsedExcalidrawScene } from "../../../../helpers/excalidrawScene";

// CSS must be imported inside the lazy module tree — never in statically-imported code.
import "@excalidraw/excalidraw/index.css";
import "./excalidrawTheme.css";

export type ExcalidrawFilePaneProps = {
  initialData: ParsedExcalidrawScene;
  theme: "light" | "dark";
  onCanvasReady: (api: ExcalidrawImperativeAPI) => void;
  onCanvasChange: (
    elements: readonly OrderedExcalidrawElement[],
    appState: Record<string, unknown>,
    files: BinaryFiles,
  ) => void;
  parseError: string | null;
};

/**
 * Thin wrapper around the Excalidraw canvas component.
 *
 * Renders either the error state (invalid JSON) or the full Excalidraw canvas
 * with the default UI toolbar.
 */
export function ExcalidrawFilePane({
  initialData,
  theme,
  onCanvasReady,
  onCanvasChange,
  parseError,
}: ExcalidrawFilePaneProps) {
  const { t } = useTranslation();
  const muiTheme = useTheme();
  const brandColors = {
    "--yishan-primary": muiTheme.palette.primary.main,
    // Dark surfaces need a lighter brand tint for contrast (Excalidraw does
    // the same with its own primary in dark mode).
    "--yishan-primary-dark": muiTheme.palette.primary.light,
  } as CSSProperties;

  if (parseError) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          px: 2,
        }}
      >
        <Typography variant="h6" sx={{ color: "text.primary", textAlign: "center" }}>
          {t("files.excalidraw.invalidFileTitle")}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center" }}>
          {t("files.excalidraw.invalidFileDescription")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      className="excalidraw-yishan"
      style={brandColors}
      sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Excalidraw
        initialData={{
          elements: initialData.elements,
          appState: initialData.appState as Partial<AppState> | null | undefined,
          files: initialData.files,
        }}
        theme={theme}
        excalidrawAPI={onCanvasReady}
        onChange={(elements, appState, files) => {
          onCanvasChange(elements, appState as unknown as Record<string, unknown>, files);
        }}
      />
    </Box>
  );
}
