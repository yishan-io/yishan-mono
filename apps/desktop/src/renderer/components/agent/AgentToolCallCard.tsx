import { Box, Collapse, IconButton, Tab, Tabs, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useMemo, useState } from "react";
import {
  LuBookOpen,
  LuBot,
  LuChevronDown,
  LuChevronUp,
  LuDatabase,
  LuFilePlus2,
  LuPencil,
  LuSearch,
  LuSquareTerminal,
} from "react-icons/lu";
import { openTab } from "../../commands/tabCommands";
import { YISHAN_DIFF_THEME_DARK, YISHAN_DIFF_THEME_LIGHT, getDiffCssVariables } from "../../helpers/diffTheme";
import type { AgentContentBlock, AgentMessage } from "../../store/agentChatTypes";
import { resolveRelativePath } from "../markdownHelpers";

type AgentToolCallCardProps = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
  workspacePath?: string;
};

type ToolPathSummaryProps = {
  icon: React.ReactNode;
  path: string;
  suffix?: React.ReactNode;
  inlineSuffix?: boolean;
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

type DiffStats = {
  added: number;
  removed: number;
};

type ReadSummary = {
  pathLabel: string;
  lineRange: string | null;
};

function getPathBaseName(filePath: string): string {
  const normalizedPath = filePath.trim().replace(/[\\/]+$/, "");
  if (normalizedPath.length === 0) {
    return filePath;
  }

  const pathSegments = normalizedPath.split(/[\\/]/);
  return pathSegments[pathSegments.length - 1] ?? filePath;
}

function getDiffStats(patch: string): DiffStats | null {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  if (added === 0 && removed === 0) return null;
  return { added, removed };
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

function parsePositiveLineNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

function buildReadSummary(path: string, offset: unknown, limit: unknown): ReadSummary {
  const startLine = parsePositiveLineNumber(offset) ?? 1;
  const lineLimit = parsePositiveLineNumber(limit);

  if (!lineLimit) {
    return {
      pathLabel: path,
      lineRange: null,
    };
  }

  return {
    pathLabel: `${path}:`,
    lineRange: `${startLine}-${startLine + lineLimit - 1}`,
  };
}

function buildWriteToolNewFileDiff(filePath: string, content: string): FileDiffMetadata | null {
  try {
    return parseDiffFromFile({ name: filePath, contents: "" }, { name: filePath, contents: content });
  } catch {
    return null;
  }
}

type GrepMatchLine = {
  filePath: string;
  lineNumber: number;
  preview: string;
};

function parseGrepMatchLines(resultText: string, grepPath: string | null): GrepMatchLine[] {
  return resultText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = /^(?<filePath>[^:]+):(?<lineNumber>\d+):\s?(?<preview>.*)$/.exec(line);
      if (!match?.groups) {
        return [];
      }

      const rawLineNumber = match.groups.lineNumber;
      if (!rawLineNumber) {
        return [];
      }

      const parsedLineNumber = Number.parseInt(rawLineNumber, 10);
      if (!Number.isFinite(parsedLineNumber) || parsedLineNumber < 1) {
        return [];
      }

      const rawFilePath = match.groups.filePath?.trim() ?? "";
      const filePath = resolveGrepFilePath(rawFilePath, grepPath);
      if (!filePath) {
        return [];
      }

      return [
        {
          filePath,
          lineNumber: parsedLineNumber,
          preview: match.groups.preview?.trim() ?? "",
        },
      ];
    });
}

function resolveGrepFilePath(rawFilePath: string, grepPath: string | null): string | null {
  if (rawFilePath.length === 0) {
    return null;
  }

  if (rawFilePath.includes("/") || rawFilePath.includes("\\")) {
    return rawFilePath;
  }

  if (grepPath && getPathBaseName(grepPath) === rawFilePath) {
    return grepPath;
  }

  return null;
}

function openGrepFileMatch(filePath: string, workspacePath: string): void {
  openTab({ kind: "file", path: resolveRelativePath(workspacePath, filePath) });
}

function ToolPathSummary({ icon, path, suffix = null, inlineSuffix = false }: ToolPathSummaryProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, minWidth: 0, flex: 1 }}>
      <Box
        component="span"
        aria-hidden
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          opacity: 0.8,
          mt: "1px",
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="body2"
        component="pre"
        sx={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          whiteSpace: "pre-wrap",
          m: 0,
          minWidth: 0,
          flex: 1,
          color: "text.primary",
        }}
      >
        {path}
        {inlineSuffix ? suffix : null}
      </Typography>
      {inlineSuffix ? null : suffix}
    </Box>
  );
}

function ToolDiffStats({ stats, highlight }: { stats: DiffStats; highlight: boolean }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
      <Typography
        variant="body2"
        component="span"
        sx={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          color: highlight ? "success.main" : "text.primary",
        }}
      >
        +{stats.added}
      </Typography>
      <Typography
        variant="body2"
        component="span"
        sx={{
          fontFamily: "monospace",
          fontSize: "0.75rem",
          color: highlight ? "error.main" : "text.primary",
        }}
      >
        -{stats.removed}
      </Typography>
    </Box>
  );
}

function ToolLineRange({ lineRange }: { lineRange: string }) {
  return (
    <Typography
      variant="body2"
      component="span"
      data-testid="read-tool-line-range"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.75rem",
        color: "info.main",
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {lineRange}
    </Typography>
  );
}

function ToolSummaryBadge({ label, color }: { label: string; color: string }) {
  return (
    <Typography
      variant="body2"
      component="span"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.75rem",
        color,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </Typography>
  );
}

function getAgentStatusBadgeColor(status: string | null): string {
  switch (status) {
    case "completed":
      return "success.main";
    case "failed":
    case "error":
      return "error.main";
    case "cancelled":
    case "canceled":
      return "warning.main";
    default:
      return "info.main";
  }
}

/** Renders a tool call block with expandable arguments or output. */
export function AgentToolCallCard({ toolCall, result = null, workspacePath }: AgentToolCallCardProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [selectedAgentTab, setSelectedAgentTab] = useState<"prompt" | "response">(result ? "response" : "prompt");
  const isBash = toolCall.name === "bash";
  const isRead = toolCall.name === "read";
  const isEdit = toolCall.name === "edit";
  const isWrite = toolCall.name === "write";
  const isGrep = toolCall.name === "grep";
  const isAgent = toolCall.name === "Agent";
  const isMemorySearch = toolCall.name === "memory_search";
  const isMemoryStore = toolCall.name === "memory_store";
  const isDiffTool = isEdit || isWrite;
  const command = typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : null;
  const readPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const diffToolPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const grepPath = typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : null;
  const argsStr = JSON.stringify(toolCall.arguments, null, 2);
  const resultText = extractResultText(result);

  const details = result?.details ?? null;
  const patchDiff =
    (typeof details?.patch === "string" ? details.patch : "") ||
    (typeof details?.diff === "string" ? details.diff : "");
  const writeContent = typeof toolCall.arguments.content === "string" ? toolCall.arguments.content : null;
  const readSummary = readPath ? buildReadSummary(readPath, toolCall.arguments.offset, toolCall.arguments.limit) : null;
  const grepPattern = typeof toolCall.arguments.pattern === "string" ? toolCall.arguments.pattern : null;
  const grepMatchLines = useMemo(() => parseGrepMatchLines(resultText, grepPath), [grepPath, resultText]);
  const agentName = typeof toolCall.arguments.agent === "string" ? toolCall.arguments.agent : null;
  const agentPrompt = typeof toolCall.arguments.prompt === "string" ? toolCall.arguments.prompt : null;
  const agentMode =
    typeof details?.mode === "string"
      ? details.mode
      : toolCall.arguments.background === true
        ? "background"
        : toolCall.arguments.background === false
          ? "foreground"
          : null;
  const agentStatus = typeof details?.status === "string" ? details.status : null;
  const memorySearchQuery = typeof toolCall.arguments.query === "string" ? toolCall.arguments.query : null;
  const memorySearchCount = typeof details?.count === "number" ? details.count : null;
  const memoryStoreSection =
    typeof details?.section === "string"
      ? details.section
      : typeof toolCall.arguments.section === "string"
        ? toolCall.arguments.section
        : null;
  const memoryStoreFilePath =
    typeof details?.path === "string"
      ? details.path
      : resultText.startsWith("Stored memory entry in ")
        ? resultText.slice("Stored memory entry in ".length).trim()
        : null;
  const memoryStoreFileLabel = memoryStoreFilePath ? getPathBaseName(memoryStoreFilePath) : "MEMORY.md";
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

  return (
    <Box
      sx={{
        mb: 0.5,
        border: isBash || isRead || isDiffTool || isGrep || isAgent || isMemorySearch || isMemoryStore ? 0 : 1,
        borderColor: result?.isError ? "error.main" : "primary.main",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      {!isBash && !isRead && !isDiffTool && !isGrep && !isAgent && !isMemorySearch && !isMemoryStore && (
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
            <ToolPathSummary icon={<LuSquareTerminal size={14} />} path={command} />
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : isRead && readPath ? (
          <ToolPathSummary
            icon={<LuBookOpen size={14} />}
            path={readSummary?.pathLabel ?? readPath}
            suffix={readSummary?.lineRange ? <ToolLineRange lineRange={readSummary.lineRange} /> : null}
            inlineSuffix
          />
        ) : isGrep && grepPattern ? (
          <Box
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <ToolPathSummary
              icon={<LuSearch size={14} />}
              path={grepPattern}
              suffix={grepPath ? <ToolSummaryBadge label={getPathBaseName(grepPath)} color="info.main" /> : null}
            />
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : isAgent && agentName && agentPrompt ? (
          <Box
            data-testid="agent-tool-summary"
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              cursor: "pointer",
            }}
          >
            <Box component="span" aria-hidden sx={{ display: "inline-flex", alignItems: "center", opacity: 0.8 }}>
              <LuBot size={14} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
              {agentName}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {agentPrompt}
            </Typography>
            {agentMode ? <ToolSummaryBadge label={agentMode} color="secondary.main" /> : null}
            {agentStatus ? (
              <ToolSummaryBadge label={agentStatus} color={getAgentStatusBadgeColor(agentStatus)} />
            ) : null}
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : isMemorySearch && memorySearchQuery ? (
          <Box
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <ToolPathSummary
              icon={<LuSearch size={14} />}
              path={memorySearchQuery}
              suffix={
                memorySearchCount !== null ? (
                  <ToolSummaryBadge label={`${memorySearchCount} results`} color="info.main" />
                ) : null
              }
            />
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : isMemoryStore ? (
          <Box
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <ToolPathSummary
              icon={<LuDatabase size={14} />}
              path={memoryStoreFileLabel}
              suffix={
                memoryStoreSection ? <ToolSummaryBadge label={memoryStoreSection} color="secondary.main" /> : null
              }
            />
            <IconButton size="small" sx={{ width: 20, height: 20, flexShrink: 0 }}>
              {open ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </IconButton>
          </Box>
        ) : isDiffTool && diffToolPath ? (
          <Box
            onClick={() => setOpen(!open)}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <ToolPathSummary
              icon={isEdit ? <LuPencil size={14} /> : <LuFilePlus2 size={14} />}
              path={diffToolPath}
              suffix={diffStats ? <ToolDiffStats stats={diffStats} highlight={isEdit} /> : null}
            />
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
      {isAgent && agentPrompt ? (
        <Collapse in={open}>
          <Box sx={{ bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
            <Tabs
              value={resultText ? selectedAgentTab : "prompt"}
              onChange={(_, value: "prompt" | "response") => {
                setSelectedAgentTab(value);
              }}
              sx={{
                minHeight: 28,
                borderBottom: 1,
                borderColor: "divider",
                px: 0.5,
                alignItems: "flex-start",
                "& .MuiTabs-flexContainer": {
                  gap: 0.5,
                },
              }}
            >
              <Tab
                label="Prompt"
                value="prompt"
                sx={{ minHeight: 28, minWidth: 0, px: 1, py: 0.5, textTransform: "none", fontSize: "0.75rem" }}
              />
              {resultText ? (
                <Tab
                  label="Response"
                  value="response"
                  sx={{ minHeight: 28, minWidth: 0, px: 1, py: 0.5, textTransform: "none", fontSize: "0.75rem" }}
                />
              ) : null}
            </Tabs>
            {(selectedAgentTab === "prompt" || !resultText) && (
              <Box data-testid="agent-tool-prompt" sx={{ px: 1.5, py: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  prompt
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
                  {agentPrompt}
                </Typography>
              </Box>
            )}
            {resultText && selectedAgentTab === "response" ? (
              <Box data-testid="agent-tool-response" sx={{ px: 1.5, py: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  response{result?.isError ? " (error)" : ""}
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
            ) : null}
          </Box>
        </Collapse>
      ) : null}
      {resultText && !isAgent && !isRead && (!isDiffTool || (!renderedDiff && !patchDiff)) && (
        <Collapse in={open}>
          <Box sx={{ px: 1.5, py: 1, bgcolor: "background.paper", borderTop: 1, borderColor: "divider" }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              output{result?.isError ? " (error)" : ""}
            </Typography>
            {isGrep && grepMatchLines.length > 0 ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {grepMatchLines.map((matchLine) => {
                  const rowLabel = `${getPathBaseName(matchLine.filePath)}:${matchLine.lineNumber}: ${matchLine.preview}`;
                  return workspacePath ? (
                    <Box
                      key={`${matchLine.filePath}:${matchLine.lineNumber}:${matchLine.preview}`}
                      component="button"
                      type="button"
                      onClick={() => {
                        openGrepFileMatch(matchLine.filePath, workspacePath);
                      }}
                      sx={{
                        border: 0,
                        p: 0,
                        m: 0,
                        bgcolor: "transparent",
                        textAlign: "left",
                        color: "info.main",
                        cursor: "pointer",
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                      }}
                    >
                      {rowLabel}
                    </Box>
                  ) : (
                    <Typography
                      key={`${matchLine.filePath}:${matchLine.lineNumber}:${matchLine.preview}`}
                      variant="body2"
                      component="pre"
                      sx={{
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        whiteSpace: "pre-wrap",
                        m: 0,
                      }}
                    >
                      {rowLabel}
                    </Typography>
                  );
                })}
              </Box>
            ) : (
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
            )}
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
