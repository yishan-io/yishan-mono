import { Button, IconButton, Menu, MenuItem, type SxProps, type Theme, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { LuChevronDown } from "react-icons/lu";

export type TableDropdownMenuColumn = {
  label: string;
  align?: "left" | "right";
};

export type TableDropdownMenuCell = {
  label: string;
  align?: "left" | "right";
  noWrap?: boolean;
  mono?: boolean;
  title?: string;
};

export type TableDropdownMenuRow = {
  id: string;
  cells: TableDropdownMenuCell[];
};

type TableDropdownMenuProps = {
  anchorEl: HTMLElement | null;
  rows: TableDropdownMenuRow[];
  columns: TableDropdownMenuColumn[];
  summaryLabel: string;
  toggleAriaLabel: string;
  emptyLabel?: string;
  gridTemplateColumns: string;
  paperMinWidth: number;
  buttonMaxWidth?: number;
  getRowAction?: (rowId: string) => {
    ariaLabel: string;
    icon: ReactNode;
    onClick: (rowId: string) => void;
    disabled?: boolean;
  } | null;
  onClose: () => void;
  onOpen: (anchorEl: HTMLElement) => void;
  onSelectRow: (rowId: string) => void;
};

/** Warns in development when one row cell count diverges from table column count. */
function validateTableShape(columns: TableDropdownMenuColumn[], rows: TableDropdownMenuRow[]): void {
  if (!import.meta.env.DEV) {
    return;
  }

  for (const row of rows) {
    if (row.cells.length !== columns.length) {
      console.warn(
        `[TableDropdownMenu] Row '${row.id}' has ${row.cells.length} cells, but ${columns.length} columns were configured.`,
      );
    }
  }
}

/** Renders one reusable table-like dropdown menu used by compact toolbar metrics controls. */
export function TableDropdownMenu({
  anchorEl,
  rows,
  columns,
  summaryLabel,
  toggleAriaLabel,
  emptyLabel,
  gridTemplateColumns,
  paperMinWidth,
  buttonMaxWidth,
  getRowAction,
  onClose,
  onOpen,
  onSelectRow,
}: TableDropdownMenuProps) {
  validateTableShape(columns, rows);

  const gridSx = {
    display: "grid",
    gridTemplateColumns,
    columnGap: 1,
  } as const satisfies SxProps<Theme>;

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        aria-label={toggleAriaLabel}
        onClick={(event) => {
          onOpen(event.currentTarget);
        }}
        endIcon={<LuChevronDown size={14} />}
        sx={{
          color: "text.secondary",
          borderColor: "divider",
          minWidth: 0,
          px: 1,
          minHeight: 28,
          ...(buttonMaxWidth ? { maxWidth: buttonMaxWidth } : {}),
        }}
      >
        <Typography variant="caption" noWrap sx={{ fontSize: 12, lineHeight: 1.2 }}>
          {summaryLabel}
        </Typography>
      </Button>
      <Menu
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        slotProps={{
          list: {
            sx: {
              py: 0,
            },
          },
          paper: {
            sx: {
              minWidth: paperMinWidth,
            },
          },
        }}
        onClose={onClose}
      >
        <Typography
          component="div"
          sx={{
            ...gridSx,
            px: 1.5,
            py: 0.75,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "action.hover",
          }}
        >
          {columns.map((column, index) => (
            <Typography
              key={`column-${index}-${column.label}`}
              variant="caption"
              color="text.secondary"
              sx={{
                textAlign: column.align === "right" ? "right" : "left",
                fontSize: 11,
                lineHeight: 1.2,
              }}
            >
              {column.label}
            </Typography>
          ))}
        </Typography>
        {rows.length > 0 ? (
          rows.map((row) => (
            <MenuItem
              key={row.id}
              sx={{
                ...gridSx,
                minHeight: 32,
                py: 0.5,
                px: 1.5,
                pr: getRowAction ? 4 : 1.5,
                position: "relative",
              }}
              onClick={() => {
                onSelectRow(row.id);
              }}
            >
              {(() => {
                const rowAction = getRowAction?.(row.id);
                if (!rowAction) {
                  return null;
                }
                return (
                  <IconButton
                    size="small"
                    aria-label={rowAction.ariaLabel}
                    disabled={rowAction.disabled === true}
                    sx={{
                      p: 0.25,
                      position: "absolute",
                      right: 6,
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      rowAction.onClick(row.id);
                    }}
                  >
                    {rowAction.icon}
                  </IconButton>
                );
              })()}
              {row.cells.map((cell, index) => {
                const defaultAlign = columns[index]?.align === "right" ? "right" : "left";
                const resolvedAlign = cell.align ?? defaultAlign;
                return (
                  <Typography
                    key={`${row.id}-cell-${index}`}
                    variant="caption"
                    noWrap={Boolean(cell.noWrap)}
                    title={cell.title}
                    sx={{
                      display: "block",
                      width: "100%",
                      textAlign: resolvedAlign,
                      fontFamily: cell.mono ? "monospace" : undefined,
                      fontSize: 12,
                      lineHeight: 1.2,
                    }}
                  >
                    {cell.label}
                  </Typography>
                );
              })}
            </MenuItem>
          ))
        ) : emptyLabel ? (
          <MenuItem disabled sx={{ minHeight: 32, py: 0.5, px: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.2 }}>
              {emptyLabel}
            </Typography>
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
