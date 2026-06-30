import { Box, Typography, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { openLink } from "../../commands/appCommands";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { markdownService } from "../markdownService";
import { useMarkdownStyles } from "../markdownStyles";

type AgentMarkdownContentProps = {
  content: string;
};

/** Renders assistant response text as sanitized markdown HTML. */
export function AgentMarkdownContent({ content }: AgentMarkdownContentProps) {
  const theme = useTheme();
  const styles = useMarkdownStyles(theme, 14);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
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
  }, [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !html) {
      return;
    }
    container.innerHTML = html;
  }, [html]);

  if (!html) {
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
        if (!href) {
          return;
        }
        event.preventDefault();
        void openLink({ url: href });
      }}
    />
  );
}
