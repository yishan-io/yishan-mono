import { TableDropdownMenu } from "./TableDropdownMenu";

const RESOURCE_USAGE_GRID_TEMPLATE_COLUMNS = "minmax(0, 1.4fr) minmax(0, 0.6fr) minmax(0, 0.6fr) minmax(0, 0.8fr)";

export type ResourceUsageMenuRow = {
  id: string;
  processNameLabel: string;
  pidLabel: string;
  cpuLabel: string;
  memoryLabel: string;
};

type ResourceUsageMenuProps = {
  anchorEl: HTMLElement | null;
  rows: ResourceUsageMenuRow[];
  summaryLabel: string;
  toggleAriaLabel: string;
  processColumnLabel: string;
  pidColumnLabel: string;
  cpuColumnLabel: string;
  memoryColumnLabel: string;
  emptyLabel: string;
  onClose: () => void;
  onOpen: (anchorEl: HTMLElement) => void;
  onSelectRow: (rowId: string) => void;
};

/** Renders one stateless resource-usage button and subprocess metrics dropdown. */
export function ResourceUsageMenu({
  anchorEl,
  rows,
  summaryLabel,
  toggleAriaLabel,
  processColumnLabel,
  pidColumnLabel,
  cpuColumnLabel,
  memoryColumnLabel,
  emptyLabel,
  onClose,
  onOpen,
  onSelectRow,
}: ResourceUsageMenuProps) {
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
            label: row.pidLabel,
            mono: true,
            align: "right",
          },
          {
            label: row.cpuLabel,
            mono: true,
            align: "right",
          },
          {
            label: row.memoryLabel,
            mono: true,
            align: "right",
          },
        ],
      }))}
      columns={[
        { label: processColumnLabel },
        { label: pidColumnLabel, align: "right" },
        { label: cpuColumnLabel, align: "right" },
        { label: memoryColumnLabel, align: "right" },
      ]}
      summaryLabel={summaryLabel}
      toggleAriaLabel={toggleAriaLabel}
      emptyLabel={emptyLabel}
      gridTemplateColumns={RESOURCE_USAGE_GRID_TEMPLATE_COLUMNS}
      paperMinWidth={340}
      onOpen={onOpen}
      onClose={onClose}
      onSelectRow={onSelectRow}
    />
  );
}
