import { Box, Collapse } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { FileDiff } from "@pierre/diffs/react";
import { useMemo, useState } from "react";
import { LuFilePlus2, LuPencil } from "react-icons/lu";
import { YISHAN_DIFF_THEME_DARK, YISHAN_DIFF_THEME_LIGHT, getDiffCssVariables } from "../../../helpers/diffTheme";
import { ToolDiffStats } from "./ToolBadges";
import { ToolCardShell, ToolSummaryPanel } from "./ToolCardShell";
import { ToolExpandableSummary } from "./ToolExpandableSummary";
import { ToolPathSummary } from "./ToolPathSummary";
import { type AgentToolCallCardProps, buildWriteToolNewFileDiff, getDiffStats, parseToolDiff } from "./helpers";

/** Renders the specialized edit/write tool-call card. */
export function DiffToolCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const isEdit = toolCall.name === "edit";
  const isWrite = toolCall.name === "write";
  const diffToolPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const patchDiff =
    (typeof result?.details?.patch === "string" ? result.details.patch : "") ||
    (typeof result?.details?.diff === "string" ? result.details.diff : "");
  const writeContent = typeof toolCall.arguments.content === "string" ? toolCall.arguments.content : null;
  const diffStats = patchDiff ? getDiffStats(patchDiff) : null;
  const parsedPatchDiff = useMemo(() => parseToolDiff(patchDiff), [patchDiff]);
  const syntheticWriteDiff = useMemo(() => {
    if (!isWrite || patchDiff || !diffToolPath || writeContent === null) {
      return null;
    }

    return buildWriteToolNewFileDiff(diffToolPath, writeContent);
  }, [diffToolPath, isWrite, patchDiff, writeContent]);
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
  const diffTheme = theme.palette.mode === "dark" ? YISHAN_DIFF_THEME_DARK : YISHAN_DIFF_THEME_LIGHT;
  const diffCssVars = useMemo(() => getDiffCssVariables(theme.palette.mode), [theme.palette.mode]);

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
                    "--diffs-font-family": '"JetBrains Mono", "SF Mono", Menlo, monospace',
                    "--diffs-font-size": "12px",
                    "--diffs-line-height": "18px",
                    ...diffCssVars,
                  } as React.CSSProperties
                }
                options={{
                  theme: diffTheme,
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
    </ToolCardShell>
  );
}
