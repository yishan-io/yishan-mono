import { useEffect, useRef, useState } from "react";
import { MarkdownPreviewRenderer } from "./MarkdownPreviewRenderer";

const MARKDOWN_RENDER_DEBOUNCE_MS = 400;

/** Public props for the markdown preview component. */
export interface MarkdownPreviewProps {
  content: string;
  filePath?: string;
  worktreePath?: string;
  canEdit?: boolean;
  onContentChange?: (content: string) => void;
  immediateUpdateToken?: number;
  findOpen?: boolean;
  findQuery?: string;
  findActiveIndex?: number;
  onFindMatchCountChange?: (count: number) => void;
  onFindQueryChange?: (query: string) => void;
  onFindNext?: () => void;
  onFindPrev?: () => void;
  onFindClose?: () => void;
}

/**
 * Renders a Markdown string as styled HTML using the markdown preview subsystem.
 * Debounces content updates to avoid re-running expensive markdown parsing on every keystroke.
 */
export function MarkdownPreview({
  content,
  filePath,
  worktreePath,
  canEdit = false,
  onContentChange,
  immediateUpdateToken = 0,
  findOpen,
  findQuery,
  findActiveIndex,
  onFindMatchCountChange,
  onFindQueryChange,
  onFindNext,
  onFindPrev,
  onFindClose,
}: MarkdownPreviewProps) {
  const [debouncedContent, setDebouncedContent] = useState(content);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousImmediateUpdateTokenRef = useRef(immediateUpdateToken);

  useEffect(() => {
    if (immediateUpdateToken !== previousImmediateUpdateTokenRef.current) {
      previousImmediateUpdateTokenRef.current = immediateUpdateToken;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDebouncedContent(content);
      return;
    }

    if (!debouncedContent && content) {
      setDebouncedContent(content);
      return;
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDebouncedContent(content);
    }, MARKDOWN_RENDER_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [content, debouncedContent, immediateUpdateToken]);

  return (
    <MarkdownPreviewRenderer
      content={debouncedContent}
      filePath={filePath}
      worktreePath={worktreePath}
      canEdit={canEdit}
      onContentChange={onContentChange}
      findOpen={findOpen}
      findQuery={findQuery}
      findActiveIndex={findActiveIndex}
      onFindMatchCountChange={onFindMatchCountChange}
      onFindQueryChange={onFindQueryChange}
      onFindNext={onFindNext}
      onFindPrev={onFindPrev}
      onFindClose={onFindClose}
    />
  );
}
