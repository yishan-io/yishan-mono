import { Box, Collapse } from "@mui/material";
import { FileDiff } from "@pierre/diffs/react";
import { editorSettingsStore } from "@renderer/domains/settings";
import { useMemo, useState } from "react";
import { LuFilePlus2, LuPencil } from "react-icons/lu";
import { MONO_FONT_FAMILY } from "../../../../../helpers/codeThemes";
import { getDiffCssVariablesForPalette } from "../../../../../helpers/diffTheme";
import { useCodeTheme } from "../../../../../ui/hooks/useCodeTheme";
import { ToolDiffStats } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolOutputSection } from "./ToolOutputSection";
import { ToolPathSummary } from "./ToolPathSummary";
import {
  type AgentToolCallCardProps,
  buildWriteToolNewFileDiff,
  extractResultText,
  getDiffStats,
  getToolDisplayPath,
  parseToolDiff,
} from "./helpers";

/** Renders the specialized edit/write tool-call card. */
export function DiffToolCard({ toolCall, result = null, workspacePath }: AgentToolCallCardProps) {
  const { palette, themeName, mode } = useCodeTheme();
  const editorFontSize = editorSettingsStore((s) => s.editorFontSize);
  const diffLineHeight = Math.round(editorFontSize * 1.5);

  const [open, setOpen] = useState(false);
  const isEdit = toolCall.name === "edit";
  const isWrite = toolCall.name === "write";
  const rawPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const diffToolPath = rawPath ? getToolDisplayPath(rawPath, workspacePath) : null;
  const patchDiff =
    (typeof result?.details?.patch === "string" ? result.details.patch : "") ||
    (typeof result?.details?.diff === "string" ? result.details.diff : "");
  const writeContent = typeof toolCall.arguments.content === "string" ? toolCall.arguments.content : null;
  const resultText = extractResultText(result);
  const diffStats = patchDiff ? getDiffStats(patchDiff) : null;
  const parsedPatchDiff = useMemo(() => parseToolDiff(patchDiff), [patchDiff]);
  const syntheticWriteDiff = useMemo(() => {
    if (!isWrite || result?.isError === true || patchDiff || !diffToolPath || writeContent === null) {
      return null;
    }

    return buildWriteToolNewFileDiff(diffToolPath, writeContent);
  }, [diffToolPath, isWrite, patchDiff, result?.isError, writeContent]);
  const renderedDiff = parsedPatchDiff ?? syntheticWriteDiff;
  const rawPatchDiffLines = useMemo(() => {
    const lineCounts = new Map<string, number>();
    return patchDiff.split("\n").map((line) => {
      const occurrence = lineCounts.get(line) ?? 0;
      lineCounts.set(line, occurrence + 1);
      return {
        key: `${line}:${occurrence}`,
        line,
      };
    });
  }, [patchDiff]);
  const diffCssVars = useMemo(() => getDiffCssVariablesForPalette(palette, mode), [palette, mode]);

  if (!diffToolPath) {
    return null;
  }

  return (
    <ToolCardShell isError={result?.isError === true}>
      <ToolSummaryPanel>
        <ToolExpandableSummary onToggle={() => setOpen(!open)} open={open}>
          <ToolPathSummary
            icon={isEdit ? <LuPencil size={14} /> : <LuFilePlus2 size={14} />}
            path={diffToolPath}
            suffix={diffStats ? <ToolDiffStats stats={diffStats} highlight={isEdit} /> : null}
          />
        </ToolExpandableSummary>
      </ToolSummaryPanel>
      {renderedDiff || patchDiff ? (
        <Collapse in={open}>
          <Box
            sx={{
              bgcolor: "background.paper",
              borderTop: 1,
              borderColor: "divider",
              maxHeight: 400,
              overflow: "auto",
            }}
          >
            {renderedDiff ? (
              <FileDiff
                fileDiff={renderedDiff}
                disableWorkerPool
                style={
                  {
                    "--diffs-font-family": MONO_FONT_FAMILY,
                    "--diffs-font-size": `${editorFontSize}px`,
                    "--diffs-line-height": `${diffLineHeight}px`,
                    ...diffCssVars,
                  } as React.CSSProperties
                }
                options={{
                  theme: themeName,
                  diffStyle: "unified",
                  overflow: "scroll",
                  disableFileHeader: true,
                }}
              />
            ) : (
              <Box
                component="pre"
                sx={{ fontFamily: "monospace", fontSize: "0.7rem", whiteSpace: "pre", m: 0, p: 1, lineHeight: 1.4 }}
              >
                {rawPatchDiffLines.map(({ key, line }) => {
                  const isAdd = line.startsWith("+") && !line.startsWith("+++");
                  const isDel = line.startsWith("-") && !line.startsWith("---");
                  return (
                    <Box
                      key={key}
                      sx={{
                        bgcolor: isAdd ? "success.dark" : isDel ? "error.dark" : "transparent",
                        opacity: isAdd || isDel ? 0.3 : 1,
                      }}
                    >
                      {line}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Collapse>
      ) : null}
      <ToolOutputSection open={open} resultText={resultText} isError={result?.isError === true} label="response" />
    </ToolCardShell>
  );
}
