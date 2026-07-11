import { Box, Collapse, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { YISHAN_DIFF_THEME_DARK, YISHAN_DIFF_THEME_LIGHT, getDiffCssVariables } from "../../helpers/diffTheme";
import type { AgentContentBlock, AgentMessage } from "../../store/agentChatTypes";

type AgentToolCallCardProps = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
};

function extractResultText(message: AgentMessage | null | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((block): block is Extract<AgentContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function countDiffStats(patch: string): string {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  if (added === 0 && removed === 0) return "";
  return ` +${added} -${removed}`;
}

function parseToolDiff(patch: string): FileDiffMetadata | null {
  if (!patch) {
    return null;
  }

  try {
    return getSingularPatch(patch);
  } catch {
    return null;
  }
}

function buildWriteToolNewFileDiff(filePath: string, content: string): FileDiffMetadata | null {
  try {
    return parseDiffFromFile({ name: filePath, contents: "" }, { name: filePath, contents: content });
  } catch {
    return null;
  }
}

/** Renders a tool call block with expandable arguments or output. */
export function AgentToolCallCard({ toolCall, result = null }: AgentToolCallCardProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const isBash = toolCall.name === "bash";
  const isRead = toolCall.name === "read";
  const isEdit = toolCall.name === "edit";
  const isWrite = toolCall.name === "write";
  const isDiffTool = isEdit || isWrite;
  const command = typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : null;
  const readPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const diffToolPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);
  const resultText = extractResultText(result);

  const details = result?.details ?? null;
  const patchDiff =
    (typeof details?.patch === "string" ? details.patch : "") ||
    (typeof details?.diff === "string" ? details.diff : "");
  const writeContent = typeof toolCall.arguments.content === "string" ? toolCall.arguments.content : null;
  const diffStats = patchDiff ? countDiffStats(patchDiff) : "";
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

  return (
    <Box
      sx={{
        mb: 0.5,
        border: isBash || isRead || isDiffTool ? 0 : 1,
        borderColor: result?.isError ? "error.main" : "primary.main",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      {!isBash && !isRead && !isDiffTool && (
        <Box
          onClick={() => setOpen(!open)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 0.75,
            cursor: "pointer",
            bgcolor: result?.isError ? "error.main" : "primary.main",
            color: result?.isError ? "error.contrastText" : "primary.contrastText",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: "monospace" }}>
            {toolCall.name}
          </Typography>
          <IconButton size="small" sx={{ ml: "auto", color: "inherit", width: 20, height: 20 }}>
            {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
          </IconButton>
        </Box>
      )}
      <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover" }}>
        {isBash && command ? (
          <Box
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
                flex: 1,
                color: "primary.main",
              }}
            >
              $ {command}
            </Typography>
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : isRead && readPath ? (
          <Typography
            variant="body2"
            component="pre"
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              whiteSpace: "pre-wrap",
              m: 0,
              color: "primary.main",
            }}
          >
            READ: {readPath}
          </Typography>
        ) : isDiffTool && diffToolPath ? (
          <Box
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
                flex: 1,
                color: "primary.main",
              }}
            >
              {isEdit ? "Edit" : "Write"}: {diffToolPath}
              {diffStats}
            </Typography>
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              arguments
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
              }}
            >
              {argsStr}
            </Typography>
          </>
        )}
      </Box>
      {resultText && !isRead && (!isDiffTool || (!renderedDiff && !patchDiff)) && (
        <Collapse in={open}>
          <Box sx={{ px: 1.5, py: 1, bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              output{result?.isError ? " (error)" : ""}
            </Typography>
            <Typography
              variant="body2"
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                m: 0,
                maxHeight: 200,
                overflow: "auto",
                color: result?.isError ? "error.main" : undefined,
              }}
            >
              {resultText}
            </Typography>
          </Box>
        </Collapse>
      )}
      {isDiffTool && (renderedDiff || patchDiff) && (
        <Collapse in={open}>
          <Box
            sx={{ bgcolor: "background.paper", borderTop: 1, borderColor: "divider", maxHeight: 400, overflow: "auto" }}
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
      )}
    </Box>
  );
}
