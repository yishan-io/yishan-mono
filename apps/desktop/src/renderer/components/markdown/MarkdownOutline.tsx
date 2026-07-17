import { Box } from "@mui/material";
import { LuChevronDown, LuChevronRight, LuX } from "react-icons/lu";
import type { MarkdownOutlineItem } from "./markdownOutlineTree";

type MarkdownOutlineProps = {
  items: MarkdownOutlineItem[];
  collapsedIds: Set<string>;
  activeId?: string | null;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onHide: () => void;
};

const OUTLINE_INDENT_PX = 14;

/** Renders a collapsible tree of markdown headings for the preview floating pane. */
export function MarkdownOutline({
  items,
  collapsedIds,
  activeId = null,
  onSelect,
  onToggleCollapse,
  onHide,
}: MarkdownOutlineProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        width: 240,
        minWidth: 220,
        maxWidth: 280,
        maxHeight: 320,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 1.5,
        boxShadow: "none",
      }}
    >
      <Box
        sx={{
          height: 40,
          px: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box component="span" sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>
          Outline
        </Box>
        <Box
          component="button"
          type="button"
          onClick={onHide}
          aria-label="Hide outline"
          title="Hide outline"
          sx={{
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: 0,
            borderRadius: 1,
            bgcolor: "transparent",
            color: "text.secondary",
            cursor: "pointer",
          }}
        >
          <LuX size={16} />
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto", py: 0.75 }}>
        {items.map((item) => (
          <MarkdownOutlineNode
            key={item.id}
            item={item}
            depth={0}
            collapsedIds={collapsedIds}
            activeId={activeId}
            onSelect={onSelect}
            onToggleCollapse={onToggleCollapse}
          />
        ))}
      </Box>
    </Box>
  );
}

type MarkdownOutlineNodeProps = {
  item: MarkdownOutlineItem;
  depth: number;
  collapsedIds: Set<string>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
};

function MarkdownOutlineNode({
  item,
  depth,
  collapsedIds,
  activeId,
  onSelect,
  onToggleCollapse,
}: MarkdownOutlineNodeProps) {
  const hasChildren = item.children.length > 0;
  const isCollapsed = hasChildren && collapsedIds.has(item.id);
  const isActive = activeId === item.id;

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          minWidth: 0,
          pl: 1 + (depth * OUTLINE_INDENT_PX) / 8,
          pr: 1,
        }}
      >
        {hasChildren ? (
          <Box
            component="button"
            type="button"
            onClick={() => onToggleCollapse(item.id)}
            aria-label={isCollapsed ? `Expand ${item.title}` : `Collapse ${item.title}`}
            sx={{
              width: 24,
              height: 24,
              mr: 0.125,
              color: "text.secondary",
              borderRadius: 0.5,
              flexShrink: 0,
              border: 0,
              bgcolor: "transparent",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {isCollapsed ? <LuChevronRight size={18} /> : <LuChevronDown size={18} />}
          </Box>
        ) : (
          <Box sx={{ width: 24, height: 24, mr: 0.125, flexShrink: 0 }} />
        )}
        <Box
          component="button"
          type="button"
          onClick={() => onSelect(item.id)}
          aria-label={item.title}
          sx={{
            width: "100%",
            display: "flex",
            justifyContent: "flex-start",
            textAlign: "left",
            borderRadius: 0.75,
            px: 0.75,
            py: 0.5,
            color: isActive ? "primary.main" : "text.secondary",
            bgcolor: isActive ? "action.selected" : "transparent",
            "&:hover": {
              bgcolor: isActive ? "action.selected" : "action.hover",
            },
            border: 0,
            cursor: "pointer",
          }}
        >
          <Box
            component="span"
            sx={{
              fontSize: item.level <= 2 ? 13 : 12,
              fontWeight: item.level <= 2 ? 500 : 400,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
              lineHeight: 1.35,
              color: "inherit",
            }}
          >
            {item.title}
          </Box>
        </Box>
      </Box>
      {hasChildren && !isCollapsed
        ? item.children.map((child) => (
            <MarkdownOutlineNode
              key={child.id}
              item={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              activeId={activeId}
              onSelect={onSelect}
              onToggleCollapse={onToggleCollapse}
            />
          ))
        : null}
    </>
  );
}
