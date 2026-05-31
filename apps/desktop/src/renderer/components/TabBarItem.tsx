import { Box, ButtonBase, IconButton } from "@mui/material";
import type { ReactNode } from "react";
import { LuPin, LuX } from "react-icons/lu";

type WorkspaceTab = {
  id: string;
  title: string;
  pinned: boolean;
  kind?: string;
  isDirty?: boolean;
  isTemporary?: boolean;
};

type DropTarget = {
  tabId: string;
  position: "before" | "after";
} | null;

const dirtyDotSx = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  bgcolor: "primary.main",
  flexShrink: 0,
} as const;

/** Renders one small colored dot indicating unsaved changes on a tab. */
function TabDirtyDot({ tabId, isDirty }: { tabId: string; isDirty?: boolean }) {
  if (!isDirty) {
    return null;
  }
  return <Box component="span" data-testid={`tab-dirty-dot-${tabId}`} aria-hidden sx={dirtyDotSx} />;
}

type TabBarItemProps = {
  tab: WorkspaceTab;
  active: boolean;
  canDrag: boolean;
  draggedTabId: string | null;
  dropTarget: DropTarget | null;
  focused: boolean;
  untitledLabel: string;
  unpinTabActionLabel: string;
  closeTabActionLabel: string;
  getTabIcon?: (tab: WorkspaceTab) => ReactNode;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onPromoteTemporaryTab?: (tabId: string) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>, tab: WorkspaceTab) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, tab: WorkspaceTab, paneId: string) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, tab: WorkspaceTab) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, tab: WorkspaceTab) => void;
  onDragEnd: () => void;
  itemRef: (element: HTMLDivElement | null) => void;
};

/** Renders a single tab item with icon, label, dirty dot, and close/pin button. */
export function TabBarItem({
  tab,
  active,
  canDrag,
  draggedTabId,
  dropTarget,
  focused,
  untitledLabel,
  unpinTabActionLabel,
  closeTabActionLabel,
  getTabIcon,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onPromoteTemporaryTab,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  itemRef,
}: TabBarItemProps) {
  const pinned = tab.pinned;

  const containerSx = {
    display: "flex",
    alignItems: "center",
    bgcolor: active ? "background.default" : "transparent",
    px: 2,
    width: 180,
    flexShrink: 0,
    position: "relative",
    zIndex: active ? 1 : 0,
    mb: active ? "-1px" : 0,
    transition: "background-color 120ms ease",
    borderRight: "1px solid",
    borderRightColor: "divider",
    ...(active
      ? {
          borderLeft: "1px solid",
          borderLeftColor: focused ? "primary.main" : "divider",
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -1,
            height: 2,
            bgcolor: "background.default",
          },
        }
      : {}),
    "& .tab-close": {
      opacity: 0,
      pointerEvents: "none",
      transition: "opacity 0.15s ease",
    },
    "&:hover": {
      bgcolor: active ? "background.default" : "action.hover",
    },
    "&:hover .tab-close": {
      opacity: 1,
      pointerEvents: "auto",
    },
    "& .tab-content": {
      flexGrow: 1,
      minWidth: 0,
    },
    cursor: canDrag ? "grab" : "default",
    ...(dropTarget?.tabId === tab.id && {
      ...(dropTarget.position === "before"
        ? {
            boxShadow: (theme: { palette: { primary: { main: string } } }) => `inset 2px 0 0 ${theme.palette.primary.main}`,
          }
        : {
            boxShadow: (theme: { palette: { primary: { main: string } } }) => `inset -2px 0 0 ${theme.palette.primary.main}`,
          }),
    }),
    opacity: draggedTabId === tab.id ? 0.9 : 1,
  };

  return (
    <Box
      ref={itemRef}
      draggable={canDrag}
      onContextMenu={(event) => onContextMenu(event, tab)}
      onDragStart={(event) => onDragStart(event, tab, "")}
      onDragOver={(event) => onDragOver(event, tab)}
      onDrop={(event) => onDrop(event, tab)}
      onDragEnd={onDragEnd}
      sx={containerSx}
    >
      <ButtonBase
        className="tab-content"
        disableRipple
        onClick={() => onSelectTab(tab.id)}
        onDoubleClick={() => {
          if (tab.isTemporary) {
            onPromoteTemporaryTab?.(tab.id);
          }
        }}
        sx={{
          typography: "body2",
          color: active ? "text.primary" : "text.secondary",
          py: 1,
          pl: 0.5,
          pr: 0.25,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {getTabIcon?.(tab)}
        <TabDirtyDot tabId={tab.id} isDirty={tab.isDirty} />
        <Box
          component="span"
          style={{ fontStyle: tab.isTemporary ? "italic" : "normal" }}
          sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {tab.title || untitledLabel}
        </Box>
      </ButtonBase>
      {pinned ? (
        <IconButton
          className="tab-pin"
          size="small"
          aria-label={unpinTabActionLabel}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinTab?.(tab.id);
          }}
          disabled={!onTogglePinTab}
          sx={{
            color: active ? "text.primary" : "text.secondary",
            p: 0.5,
            mr: -2,
            display: "inline-flex",
          }}
        >
          <LuPin size={14} />
        </IconButton>
      ) : (
        <IconButton
          className="tab-close"
          size="small"
          aria-label={closeTabActionLabel}
          onClick={(event) => {
            event.stopPropagation();
            onCloseTab(tab.id);
          }}
          disabled={false}
          sx={{
            color: active ? "text.primary" : "text.secondary",
            p: 0.5,
            mr: -2,
            display: "inline-flex",
          }}
        >
          <LuX size={14} />
        </IconButton>
      )}
    </Box>
  );
}
