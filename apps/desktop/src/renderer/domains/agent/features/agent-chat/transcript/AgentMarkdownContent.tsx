import { Box, Typography, useTheme } from "@mui/material";
import { openLink } from "@renderer/domains/browser";
import { isAbsoluteUrl, resolveRelativePath, toWorkspaceRelativePath } from "@renderer/domains/files";
import { markdownService } from "@renderer/domains/files";
import { useMarkdownStyles } from "@renderer/domains/files";
import { editorSettingsStore } from "@renderer/domains/settings";
import { openTab, openTabInOppositePane } from "@renderer/domains/workbench";
import { workspaceStore } from "@renderer/domains/workspace";
import { selectFolderInFileTree } from "@renderer/domains/workspace";
import { useCodeTheme } from "@renderer/ui/hooks/useCodeTheme";
import { useEffect, useRef, useState } from "react";
import { openChatFileTab } from "../../../../../domains/agent/commands/agentChatCommands";
import { getErrorMessage } from "../../../../../helpers/errorHelpers";

type AgentMarkdownContentProps = {
  content: string;
  workspacePath?: string;
  renderMode?: "final" | "streaming";
};

const FILE_LINE_RANGE_SUFFIX_RE = /:\d+(?:-\d+)?$/;

function getFilePath(href: string): string {
  return href.replace(/[?#].*$/, "").replace(FILE_LINE_RANGE_SUFFIX_RE, "");
}

function getFileLineRangeSuffix(href: string): string {
  return href.match(FILE_LINE_RANGE_SUFFIX_RE)?.[0] ?? "";
}

/**
 * Resolves the workspace owning a chat transcript by matching its cwd against
 * workspace worktree paths. The longest matching prefix wins, so sessions whose
 * cwd is a subdirectory of the worktree still map to the workspace root.
 * Returns undefined when no workspace owns the transcript.
 */
function resolveChatWorkspace(workspacePath: string): { workspaceId: string; workspaceRoot: string } | undefined {
  const { workspaces } = workspaceStore.getState();
  let best: { workspaceId: string; workspaceRoot: string } | undefined;
  for (const workspace of workspaces) {
    const root = workspace.worktreePath;
    if (!root) {
      continue;
    }
    if (workspacePath !== root && !workspacePath.startsWith(`${root}/`)) {
      continue;
    }
    if (!best || root.length > best.workspaceRoot.length) {
      best = { workspaceId: workspace.id, workspaceRoot: root };
    }
  }
  return best;
}

function openFileTab(href: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, getFilePath(href));
  const workspace = resolveChatWorkspace(workspacePath);
  if (!workspace) {
    // No known workspace owns this transcript — keep the legacy fallback open.
    openTab({ kind: "file", path: toWorkspaceRelativePath(resolvedPath, workspacePath) });
    return;
  }
  const relativePath = toWorkspaceRelativePath(resolvedPath, workspace.workspaceRoot);
  void openChatFileTab({ workspaceId: workspace.workspaceId, relativePath });
}

function openFileTabInOppositePane(href: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, getFilePath(href));
  const workspace = resolveChatWorkspace(workspacePath);
  if (!workspace) {
    openTabInOppositePane({ kind: "file", path: toWorkspaceRelativePath(resolvedPath, workspacePath) });
    return;
  }
  const relativePath = toWorkspaceRelativePath(resolvedPath, workspace.workspaceRoot);
  void openChatFileTab({ workspaceId: workspace.workspaceId, relativePath, oppositePane: true });
}

const FILE_EXT_RE =
  /\.(?:md|tsx?|jsx?|json|ya?ml|css|html|py|rs|go|java|rb|sh|bash|zsh|sql|graphql|vue|svelte|tf|dockerfile|env|cfg|ini|toml|lock|gitignore|editorconfig|csv|xml|svg)$/i;

function looksLikeFilePath(text: string): boolean {
  // Must contain a path separator or look like a dotfile.
  if (!text.includes("/") && !text.includes("\\") && !text.startsWith(".")) return false;
  // Must not contain whitespace or obvious non-path tokens.
  if (/\s/.test(text)) return false;
  // Explicit directory marker → not a file.
  if (/[/\\]$/.test(text)) return false;
  // Must look like a file: ends with a known extension, or starts like a path.
  if (FILE_EXT_RE.test(text)) return true;
  if (/^[.\/\\]/.test(text) || /^[a-zA-Z]:[\\/]/.test(text)) return true;
  return false;
}

function looksLikeFolderPath(text: string): boolean {
  // Must contain a path separator or start with a dot (e.g. .my-context/).
  if (!text.includes("/") && !text.includes("\\") && !text.startsWith(".")) return false;
  // Must not contain whitespace.
  if (/\s/.test(text)) return false;
  // Exclude URLs.
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return false;
  // Ends with / or \ → explicit directory marker.
  if (/[/\\]$/.test(text)) return true;
  // Has no known file extension → likely a folder.
  if (!FILE_EXT_RE.test(text)) return true;
  return false;
}

function openFolderInFileTree(href: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, getFilePath(href));
  // Strip workspacePath prefix to get the workspace-relative path expected by the file tree.
  selectFolderInFileTree(toWorkspaceRelativePath(resolvedPath, workspacePath));
}

/** Renders assistant response text as sanitized markdown HTML. */
export function AgentMarkdownContent({ content, workspacePath, renderMode = "final" }: AgentMarkdownContentProps) {
  const theme = useTheme();
  const { palette: codePalette, mode: codeMode } = useCodeTheme();
  const editorFontSize = editorSettingsStore((state) => state.editorFontSize);
  const styles = useMarkdownStyles(theme, 14, codePalette, editorFontSize, codeMode);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (renderMode === "streaming") {
      setHtml("");
      return;
    }

    let isCancelled = false;

    const parse = async (): Promise<void> => {
      try {
        const parsed = await markdownService.parse(content);
        if (!isCancelled) {
          setHtml(parsed);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("[AgentMarkdownContent] Failed to parse markdown:", getErrorMessage(error));
          setHtml("");
        }
      }
    };

    void parse();

    return () => {
      isCancelled = true;
    };
  }, [content, renderMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !html) {
      return;
    }
    container.innerHTML = html;

    // Make file-path-like and folder-path-like <code> elements clickable.
    if (!workspacePath) return;
    const codeElements = Array.from(container.querySelectorAll("code"));
    for (const code of codeElements) {
      const text = code.textContent?.trim() ?? "";
      const filePath = getFilePath(text);
      const lineRangeSuffix = getFileLineRangeSuffix(text);
      const isFolder = looksLikeFolderPath(filePath);
      const isFile = looksLikeFilePath(filePath);
      if (!isFolder && !isFile) continue;
      const span = document.createElement("span");
      span.className = "file-link";
      span.style.cursor = "pointer";
      span.textContent = filePath;
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        // Check isFile first: dotfiles like .eslintrc match both, treat as files.
        if (isFile) {
          if (e.metaKey || e.ctrlKey) {
            openFileTabInOppositePane(filePath, workspacePath);
          } else {
            openFileTab(filePath, workspacePath);
          }
        } else if (isFolder) {
          openFolderInFileTree(filePath, workspacePath);
        }
      });
      if (lineRangeSuffix) {
        const lineRange = document.createElement("span");
        lineRange.className = "file-line-range";
        lineRange.textContent = lineRangeSuffix;
        code.replaceWith(span, lineRange);
      } else {
        code.replaceWith(span);
      }
    }
  }, [html, workspacePath]);

  if (renderMode === "streaming" || !html) {
    return (
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "break-word", mb: 0.5 }}>
        {content}
      </Typography>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        ...styles.container,
        fontSize: 14,
        mb: 0.5,
        "& .file-link": {
          color: "primary.main",
          textDecoration: "none",
          textUnderlineOffset: "2px",
          "&:hover": {
            textDecoration: "underline",
          },
        },
        "& .file-line-range": {
          color: "text.disabled",
        },
      }}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const link = target.closest("a");
        const href = link?.getAttribute("href");
        if (!href || href.startsWith("#")) {
          return;
        }
        event.preventDefault();

        // Detect cmd+click (macOS) or ctrl+click (Windows/Linux) for opposite-pane open
        const isOppositeOpen = event.metaKey || event.ctrlKey;

        if (isAbsoluteUrl(href)) {
          if (isOppositeOpen) {
            // Open external URL in a browser tab on the opposite pane
            openTabInOppositePane({ kind: "browser", url: href });
          } else {
            void openLink({ url: href });
          }
        } else if (workspacePath) {
          // Check isFile first: dotfiles like .eslintrc match both, treat as files.
          if (looksLikeFilePath(href)) {
            if (isOppositeOpen) {
              openFileTabInOppositePane(href, workspacePath);
            } else {
              openFileTab(href, workspacePath);
            }
          } else if (looksLikeFolderPath(href)) {
            openFolderInFileTree(href, workspacePath);
          }
        }
      }}
    />
  );
}
