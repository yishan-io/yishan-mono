import { generateDiffFile } from "@git-diff-view/file";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useMemo } from "react";

type ProjectDiffViewerProps = {
  filePath: string;
  oldContent: string;
  newContent: string;
};

function getMockLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase();

  if (extension === "ts" || extension === "tsx") {
    return "typescript";
  }

  if (extension === "js" || extension === "jsx") {
    return "javascript";
  }

  if (extension === "json") {
    return "json";
  }

  return "plaintext";
}

export function ProjectDiffViewer({ filePath, oldContent, newContent }: ProjectDiffViewerProps) {
  const theme = useTheme();
  const diffFile = useMemo(() => {
    if (!oldContent.trim() && !newContent.trim()) {
      return null;
    }

    const language = getMockLanguage(filePath);

    const file = generateDiffFile(filePath, oldContent, filePath, newContent, language, language);

    file.initTheme(theme.palette.mode);
    file.init();
    file.buildSplitDiffLines();

    return file;
  }, [filePath, oldContent, newContent, theme.palette.mode]);

  if (!diffFile) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No diff available for {filePath}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        boxSizing: "border-box",
        overflow: "auto",
      }}
    >
      <Typography variant="body2" sx={{ p: 1, color: "text.secondary" }}>
        {filePath}
      </Typography>
      <DiffView
        diffViewFontSize={12}
        diffFile={diffFile}
        diffViewMode={DiffModeEnum.Split}
        diffViewTheme={theme.palette.mode}
        diffViewWrap
      />
    </Box>
  );
}
