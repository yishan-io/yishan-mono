import { Box, Typography, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { openLink } from "../../commands/appCommands";
import { openTab } from "../../commands/tabCommands";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { isAbsoluteUrl, resolveRelativePath } from "../markdownHelpers";
import { markdownService } from "../markdownService";
import { useMarkdownStyles } from "../markdownStyles";

type AgentMarkdownContentProps = {
  content: string;
  workspacePath?: string;
  renderMode?: "final" | "streaming";
};

function openFileTab(href: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, href.replace(/[?#].*$/, ""));
  openTab({ kind: "file", path: resolvedPath });
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
      if (!looksLikeFilePath(text)) continue;
      const span = document.createElement("span");
      span.className = "file-link";
      span.style.cssText = "cursor:pointer;text-decoration:underline;text-underline-offset:2px;";
      span.textContent = text;
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        openFileTab(text, workspacePath);
      });
      code.replaceWith(span);
    }
  }, [html, workspacePath]);

  if (renderMode === "streaming" || !html) {
    return (
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 0.5 }}>
        {content}
      </Typography>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{ ...styles.container, fontSize: 14, mb: 0.5 }}
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

        // Open file paths in a tab, external URLs in browser.
        if (isAbsoluteUrl(href)) {
          void openLink({ url: href });
        } else if (workspacePath) {
          void openFileTab(href, workspacePath);
        }
      }}
    />
  );
}
