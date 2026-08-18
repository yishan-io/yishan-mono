import { LuX } from "react-icons/lu";
import { TableDropdownMenu } from "./TableDropdownMenu";

const PORTS_GRID_TEMPLATE_COLUMNS = "minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 0.6fr) 28px";

export type PortsTableMenuRow = {
  id: string;
  portLabel: string;
  pidLabel: string;
  processNameLabel: string;
  portTooltip?: string;
};

type PortsTableMenuProps = {
  anchorEl: HTMLElement | null;
  rows: PortsTableMenuRow[];
  summaryLabel: string;
  toggleAriaLabel: string;
  portColumnLabel: string;
  pidColumnLabel: string;
  processNameColumnLabel: string;
  onClose: () => void;
  onOpen: (anchorEl: HTMLElement) => void;
  onSelectRow: (rowId: string) => void;
  onCloseRow: (rowId: string) => void;
  isClosingRow?: (rowId: string) => boolean;
};

/** Renders one stateless ports button and table-like dropdown with process, port, pid, and row action. */
export function PortsTableMenu({
  anchorEl,
  rows,
  summaryLabel,
  toggleAriaLabel,
  portColumnLabel,
  pidColumnLabel,
  processNameColumnLabel,
  onClose,
  onOpen,
  onSelectRow,
  onCloseRow,
  isClosingRow,
}: PortsTableMenuProps) {
  return (
    <TableDropdownMenu
      anchorEl={anchorEl}
      rows={rows.map((row) => ({
        id: row.id,
        cells: [
          {
            label: row.processNameLabel,
            noWrap: true,
          },
          {
            label: row.portLabel,
            mono: true,
            noWrap: true,
            title: row.portTooltip,
          },
          {
            label: row.pidLabel,
            mono: true,
            align: "right",
          },
          {
            label: "",
          },
        ],
      }))}
      columns={[
        { label: processNameColumnLabel },
        { label: portColumnLabel },
        { label: pidColumnLabel, align: "right" },
        { label: "", align: "right" },
      ]}
      summaryLabel={summaryLabel}
      toggleAriaLabel={toggleAriaLabel}
      gridTemplateColumns={PORTS_GRID_TEMPLATE_COLUMNS}
      paperMinWidth={240}
      onOpen={onOpen}
      onClose={onClose}
      onSelectRow={onSelectRow}
      getRowAction={(rowId) => ({
        ariaLabel: `Close port ${rows.find((row) => row.id === rowId)?.portLabel ?? ""}`,
        icon: <LuX size={12} />,
        onClick: onCloseRow,
        disabled: isClosingRow?.(rowId) ?? false,
      })}
    />
  );
}
