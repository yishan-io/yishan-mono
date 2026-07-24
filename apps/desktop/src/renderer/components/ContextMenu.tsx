import { Box, Divider, ListItemIcon, Menu, MenuItem } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { LuChevronRight } from "react-icons/lu";

type ContextMenuLeafItem = {
  kind?: "item";
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  endAdornment?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void | Promise<void>;
};

type ContextMenuParentItem = {
  kind?: "item";
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  endAdornment?: ReactNode;
  disabled?: boolean;
  items: ContextMenuEntry[];
};

type ContextMenuDivider = {
  kind: "divider";
  id: string;
};

/** Describes one menu entry, including nested submenu entries. */
export type ContextMenuEntry = ContextMenuLeafItem | ContextMenuParentItem | ContextMenuDivider;

type ContextMenuPosition = {
  top: number;
  left: number;
};

type ContextMenuProps = {
  open: boolean;
  onClose: () => void;
  items: ContextMenuEntry[];
  anchorPosition?: ContextMenuPosition;
  anchorEl?: HTMLElement | null;
  marginThreshold?: number;
  submenuDirection?: "left" | "right";
  submenuPaperSx?: SxProps<Theme>;
};

type OpenSubmenu = {
  id: string;
  anchorEl: HTMLElement;
  items: ContextMenuEntry[];
};

/** Prevents native menu fallback from one custom menu surface. */
function suppressMenuSurfaceContextMenu(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

/** Returns true when one menu entry represents a divider. */
function isDivider(item: ContextMenuEntry): item is ContextMenuDivider {
  return item.kind === "divider";
}

/** Returns true when one menu entry owns one nested submenu list. */
function hasSubmenu(item: ContextMenuEntry): item is ContextMenuParentItem {
  return !isDivider(item) && "items" in item && Array.isArray(item.items) && item.items.length > 0;
}

/**
 * Renders one context menu from nested menu entries.
 * Nested submenus open on hover/click and close with the root menu.
 */
export function ContextMenu({
  open,
  onClose,
  items,
  anchorPosition,
  anchorEl,
  marginThreshold,
  submenuDirection = "right",
  submenuPaperSx,
}: ContextMenuProps) {
  const [openSubmenus, setOpenSubmenus] = useState<OpenSubmenu[]>([]);

  useEffect(() => {
    if (!open) {
      setOpenSubmenus([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void anchorEl;
    void anchorPosition;
    setOpenSubmenus([]);
  }, [anchorEl, anchorPosition, open]);

  const submenuAnchorOrigin = useMemo(
    () =>
      submenuDirection === "left"
        ? { horizontal: "left" as const, vertical: "top" as const }
        : { horizontal: "right" as const, vertical: "top" as const },
    [submenuDirection],
  );
  const submenuTransformOrigin = useMemo(
    () =>
      submenuDirection === "left"
        ? { horizontal: "right" as const, vertical: "top" as const }
        : { horizontal: "left" as const, vertical: "top" as const },
    [submenuDirection],
  );

  /** Opens one submenu at one level and closes deeper levels. */
  const openSubmenuAtLevel = (level: number, id: string, nextItems: ContextMenuEntry[], nextAnchorEl: HTMLElement) => {
    setOpenSubmenus((current) => {
      const next = current.slice(0, level);
      next[level] = {
        id,
        items: nextItems,
        anchorEl: nextAnchorEl,
      };
      return next;
    });
  };

  /** Closes all submenu levels from one level depth onward. */
  const closeSubmenusFromLevel = (level: number) => {
    setOpenSubmenus((current) => current.slice(0, level));
  };

  /** Closes root and submenu layers together. */
  const closeAllMenus = () => {
    setOpenSubmenus([]);
    onClose();
  };

  /** Renders one menu layer and wires nested submenu events for that layer. */
  const renderMenuItems = (menuItems: ContextMenuEntry[], level: number) => {
    return menuItems.map((item) => {
      if (isDivider(item)) {
        return <Divider key={item.id} />;
      }

      const itemHasSubmenu = hasSubmenu(item);
      const isSelected = openSubmenus[level]?.id === item.id;
      const submenuChevron = <LuChevronRight size={14} aria-hidden="true" />;

      return (
        <MenuItem
          key={item.id}
          disabled={item.disabled}
          selected={itemHasSubmenu ? isSelected : false}
          onMouseEnter={(event) => {
            if (item.disabled) {
              closeSubmenusFromLevel(level);
              return;
            }

            if (!itemHasSubmenu) {
              closeSubmenusFromLevel(level);
              return;
            }

            openSubmenuAtLevel(level, item.id, item.items, event.currentTarget);
          }}
          onClick={(event) => {
            if (item.disabled) {
              return;
            }

            if (itemHasSubmenu) {
              event.preventDefault();
              event.stopPropagation();
              openSubmenuAtLevel(level, item.id, item.items, event.currentTarget);
              return;
            }

            closeAllMenus();
            void item.onSelect?.();
          }}
          sx={
            itemHasSubmenu
              ? {
                  "&.Mui-selected, &.Mui-selected:hover": {
                    bgcolor: "action.selected",
                  },
                }
              : undefined
          }
        >
          {item.icon ? <ListItemIcon>{item.icon}</ListItemIcon> : null}
          <Box component="span" sx={{ flexGrow: 1 }}>
            {item.label}
          </Box>
          {item.endAdornment ?? (itemHasSubmenu ? submenuChevron : null)}
        </MenuItem>
      );
    });
  };

  return (
    <>
      <Menu
        open={open}
        onClose={closeAllMenus}
        onContextMenu={suppressMenuSurfaceContextMenu}
        anchorReference={anchorEl ? "anchorEl" : "anchorPosition"}
        anchorEl={anchorEl ?? null}
        anchorPosition={anchorEl ? undefined : anchorPosition}
        marginThreshold={marginThreshold}
      >
        {renderMenuItems(items, 0)}
      </Menu>
      {openSubmenus.map((submenu, index) => (
        <Menu
          key={`${submenu.id}-${index}`}
          open
          onClose={closeAllMenus}
          hideBackdrop
          onContextMenu={suppressMenuSurfaceContextMenu}
          anchorEl={submenu.anchorEl}
          sx={{ pointerEvents: "none" }}
          anchorOrigin={submenuAnchorOrigin}
          transformOrigin={submenuTransformOrigin}
          marginThreshold={0}
          slotProps={{
            paper: {
              sx: {
                pointerEvents: "auto",
                ...(submenuDirection === "left" ? { mr: 0.25 } : { ml: 0.25 }),
                ...submenuPaperSx,
              },
            },
          }}
        >
          {renderMenuItems(submenu.items, index + 1)}
        </Menu>
      ))}
    </>
  );
}
