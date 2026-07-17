import { Box } from "@mui/material";
import type { KeyboardEvent } from "react";
import { MarkdownPreview } from "../markdown/MarkdownPreview";
import { MarkdownPreviewThemeProvider } from "../markdown/MarkdownPreviewThemeProvider";

/** Props for rendering the markdown preview pane inside FileEditor. */
export type MarkdownPreviewPaneProps = {
  path: string;
  content: string;
  worktreePath?: string;
  isDeleted: boolean;
  showEditor: boolean;
  editorPaneRatio: number;
  immediateUpdateToken: number;
  findOpen: boolean;
  findQuery: string;
  findActiveIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onContentChange: (content: string) => void;
  onFindMatchCountChange: (count: number) => void;
  onFindQueryChange: (query: string) => void;
  onFindNext: () => void;
  onFindPrev: () => void;
  onFindClose: () => void;
};

/** Renders the markdown preview pane and wires preview find state. */
export function MarkdownPreviewPane({
  path,
  content,
  worktreePath,
  isDeleted,
  showEditor,
  editorPaneRatio,
  immediateUpdateToken,
  findOpen,
  findQuery,
  findActiveIndex,
  onKeyDown,
  onContentChange,
  onFindMatchCountChange,
  onFindQueryChange,
  onFindNext,
  onFindPrev,
  onFindClose,
}: MarkdownPreviewPaneProps) {
  return (
    <Box
      data-testid="markdown-preview-pane"
      onKeyDown={onKeyDown}
      tabIndex={0}
      sx={{
        flex: showEditor ? `0 0 ${Math.round((1 - editorPaneRatio) * 100)}%` : 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        outline: "none",
      }}
    >
      <MarkdownPreviewThemeProvider>
        <MarkdownPreview
          content={content}
          filePath={path}
          worktreePath={worktreePath}
          canEdit={!isDeleted}
          onContentChange={onContentChange}
          immediateUpdateToken={immediateUpdateToken}
          findOpen={findOpen}
          findQuery={findQuery}
          findActiveIndex={findActiveIndex}
          onFindMatchCountChange={onFindMatchCountChange}
          onFindQueryChange={onFindQueryChange}
          onFindNext={onFindNext}
          onFindPrev={onFindPrev}
          onFindClose={onFindClose}
        />
      </MarkdownPreviewThemeProvider>
    </Box>
  );
}
