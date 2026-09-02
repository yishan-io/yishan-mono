import { Box, Typography } from "@mui/material";
import { openLink } from "@renderer/domains/browser";
import { isAbsoluteUrl, markdownService } from "@renderer/domains/files";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useEffect, useRef, useState } from "react";

type TaskDescriptionMarkdownProps = {
  content: string;
};

/** Renders a Local Task description as compact, sanitized Markdown. */
export function TaskDescriptionMarkdown({ content }: TaskDescriptionMarkdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;
    setHtml("");
    void markdownService
      .parse(content)
      .then((parsedHtml) => {
        if (!cancelled) setHtml(parsedHtml);
      })
      .catch((error) => {
        console.error("Failed to render Local Task description", getErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [content]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.innerHTML = html;
  }, [html]);

  if (!html) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
        {content}
      </Typography>
    );
  }

  return (
    <Box
      ref={containerRef}
      data-testid="local-task-description-markdown"
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const href = target.closest("a")?.getAttribute("href");
        if (!href) return;
        event.preventDefault();
        if (isAbsoluteUrl(href)) void openLink({ url: href });
      }}
      sx={{
        color: "text.secondary",
        fontSize: "1rem",
        overflowWrap: "anywhere",
        "& > :first-of-type": { mt: 0 },
        "& > :last-child": { mb: 0 },
        "& p, & ul, & ol, & blockquote, & pre": { my: 0.75 },
        "& ul, & ol": { pl: 2.5 },
        "& code": { fontFamily: "monospace", fontSize: "0.8125rem" },
        "& a": { color: "primary.main" },
      }}
    />
  );
}
