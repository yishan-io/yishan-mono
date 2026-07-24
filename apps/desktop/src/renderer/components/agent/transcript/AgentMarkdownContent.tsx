import { Box, Typography, useTheme } from "@mui/material";
import { isAbsoluteUrl, resolveRelativePath } from "@renderer/components/markdown/markdownHelpers";
import { markdownService } from "@renderer/components/markdown/markdownService";
import { useMarkdownStyles } from "@renderer/components/markdown/markdownStyles";
import { useEffect, useRef, useState } from "react";
import { openLink } from "../../../commands/appCommands";
import { openTab, openTabInOppositePane } from "../../../commands/tabCommands";
import { getErrorMessage } from "../../../helpers/errorHelpers";

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

function openFileTab(href: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, getFilePath(href));
  openTab({ kind: "file", path: resolvedPath });
}

function openFileTabInOppositePane(href: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, getFilePath(href));
  openTabInOppositePane({ kind: "file", path: resolvedPath });
}

const FILE_PATH_RE = /^(?:\.{1,2}[\/\\]|[\/\\]|[a-zA-Z]:[\\/])|[\/\\]/;
const FILE_EXT_RE =
  /\.(?:md|tsx?|jsx?|json|ya?ml|css|html|py|rs|go|java|rb|sh|bash|zsh|sql|graphql|vue|svelte|tf|dockerfile|env|cfg|ini|toml|lock|gitignore|editorconfig|csv|xml|svg)$/i;

function looksLikeFilePath(text: string): boolean {
  // Must contain a path separator or look like a dotfile.
  if (!text.includes("/") && !text.includes("\\") && !text.startsWith(".")) return false;
  // Must not contain whitespace or obvious non-path tokens.
  if (/\s/.test(text)) return false;
  // Must look like a file: ends with a known extension, or starts like a path.
  if (FILE_EXT_RE.test(text)) return true;
  if (/^[.\/\\]/.test(text) || /^[a-zA-Z]:[\\/]/.test(text)) return true;
  return false;
}

/** Renders assistant response text as sanitized markdown HTML. */
export function AgentMarkdownContent({ content, workspacePath, renderMode = "final" }: AgentMarkdownContentProps) {
  const theme = useTheme();
  const styles = useMarkdownStyles(theme, 14);
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

    // Make file-path-like <code> elements clickable.
    if (!workspacePath) return;
    const codeElements = Array.from(container.querySelectorAll("code"));
    for (const code of codeElements) {
      const text = code.textContent?.trim() ?? "";
      const filePath = getFilePath(text);
      const lineRangeSuffix = getFileLineRangeSuffix(text);
      if (!looksLikeFilePath(filePath)) continue;
      const span = document.createElement("span");
      span.className = "file-link";
      span.style.cursor = "pointer";
      span.textContent = filePath;
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        // Detect cmd+click for opposite-pane open
        if (e.metaKey || e.ctrlKey) {
          openFileTabInOppositePane(filePath, workspacePath);
        } else {
          openFileTab(filePath, workspacePath);
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
          if (isOppositeOpen) {
            openFileTabInOppositePane(href, workspacePath);
          } else {
            openFileTab(href, workspacePath);
          }
        }
      }}
    />
  );
}
