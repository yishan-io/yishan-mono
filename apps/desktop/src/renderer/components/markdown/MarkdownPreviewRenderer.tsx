import { Box, Typography, useTheme } from "@mui/material";
import { layoutStore } from "@renderer/store/settings/layoutStore";
import { memo, useMemo, useRef } from "react";
import { MarkdownFindBar } from "./MarkdownFindBar";
import { MarkdownOutline } from "./MarkdownOutline";
import type { MarkdownPreviewProps } from "./MarkdownPreview";
import { MarkdownPreviewMetadataTable } from "./MarkdownPreviewMetadataTable";
import { MermaidPortal } from "./MermaidPortal";
import { useMarkdownStyles } from "./markdownStyles";
import { useMarkdownPreviewRendering } from "./useMarkdownPreviewRendering";

const FLOATING_OUTLINE_WIDTH_PX = 280;
const FLOATING_OUTLINE_GAP_PX = 16;
const MARKDOWN_PREVIEW_BASE_FONT_SIZE_BY_MODE = {
  small: 14,
  medium: 16,
  large: 18,
} as const;

/** Renders parsed markdown content, outline controls, find UI, and mermaid portals. */
export const MarkdownPreviewRenderer = memo(function MarkdownPreviewRenderer({
  content,
  filePath,
  worktreePath,
  canEdit = false,
  onContentChange,
  findOpen = false,
  findQuery = "",
  findActiveIndex = 0,
  onFindMatchCountChange,
  onFindQueryChange,
  onFindNext,
  onFindPrev,
  onFindClose,
}: MarkdownPreviewProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markdownPreviewFontSize = layoutStore((state) => state.markdownPreviewFontSize);
  const markdownPreviewWidth = layoutStore((state) => state.markdownPreviewWidth);
  const isMarkdownOutlineVisible = layoutStore((state) => state.isMarkdownOutlineVisible);
  const setIsMarkdownOutlineVisible = layoutStore((state) => state.setIsMarkdownOutlineVisible);
  const baseFontSize = MARKDOWN_PREVIEW_BASE_FONT_SIZE_BY_MODE[markdownPreviewFontSize];
  const styles = useMarkdownStyles(theme, baseFontSize);
  const {
    metadata,
    body,
    mermaidBlocks,
    localMatchCount,
    outlineData,
    collapsedOutlineIds,
    activeOutlineId,
    handleToggleOutlineCollapse,
    handleSelectOutlineItem,
  } = useMarkdownPreviewRendering({
    content,
    filePath,
    worktreePath,
    canEdit,
    onContentChange,
    findOpen,
    findQuery,
    findActiveIndex,
    onFindMatchCountChange,
    container: containerRef.current,
  });

  const floatingOutlineOffsetTop = findOpen ? 40 : 8;
  const shouldShowFloatingOutline = isMarkdownOutlineVisible && outlineData.items.length > 0;
  const scrollContainerPaddingRight = useMemo(
    () => (shouldShowFloatingOutline ? `${FLOATING_OUTLINE_WIDTH_PX + FLOATING_OUTLINE_GAP_PX + 24}px` : undefined),
    [shouldShowFloatingOutline],
  );

  if (!body.trim() && !metadata) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          No content to preview
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      data-testid="markdown-preview-root"
      sx={{ flex: 1, minHeight: 0, position: "relative", bgcolor: "background.default" }}
    >
      {findOpen ? (
        <MarkdownFindBar
          query={findQuery}
          activeIndex={findActiveIndex}
          matchCount={localMatchCount}
          onQueryChange={onFindQueryChange}
          onNext={onFindNext}
          onPrev={onFindPrev}
          onClose={onFindClose}
        />
      ) : null}
      {!isMarkdownOutlineVisible && outlineData.items.length > 0 ? (
        <Box
          component="button"
          type="button"
          aria-label="Show outline"
          onClick={() => setIsMarkdownOutlineVisible(true)}
          sx={{
            position: "absolute",
            top: findOpen ? 40 : 8,
            right: 8,
            zIndex: 9,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "background.paper",
            color: "text.secondary",
            px: 1,
            py: 0.5,
            cursor: "pointer",
          }}
        >
          Outline
        </Box>
      ) : null}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "auto",
          px: markdownPreviewWidth === "full" ? 3 : 4,
          py: 3,
          pr: scrollContainerPaddingRight,
        }}
      >
        {metadata ? (
          <MarkdownPreviewMetadataTable metadata={metadata} fullWidth={markdownPreviewWidth === "full"} />
        ) : null}
        <Box
          ref={containerRef}
          sx={{
            width: "100%",
            maxWidth: markdownPreviewWidth === "full" ? "none" : 860,
            mx: markdownPreviewWidth === "full" ? 0 : "auto",
            ...styles.container,
          }}
        />
        {mermaidBlocks.map((block) => (
          <MermaidPortal key={block.id} targetId={block.id} code={block.code} containerRef={containerRef} />
        ))}
      </Box>
      {shouldShowFloatingOutline ? (
        <Box
          sx={{
            position: "absolute",
            top: floatingOutlineOffsetTop,
            right: 8,
            zIndex: 8,
            width: `min(${FLOATING_OUTLINE_WIDTH_PX}px, calc(100% - 16px))`,
            maxHeight: `calc(100% - ${floatingOutlineOffsetTop + 8}px)`,
          }}
        >
          <MarkdownOutline
            items={outlineData.items}
            collapsedIds={collapsedOutlineIds}
            activeId={activeOutlineId}
            onSelect={handleSelectOutlineItem}
            onToggleCollapse={handleToggleOutlineCollapse}
            onHide={() => setIsMarkdownOutlineVisible(false)}
          />
        </Box>
      ) : null}
    </Box>
  );
});
