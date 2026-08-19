import { TableDropdownMenu } from "../../../../ui/components/TableDropdownMenu";

const WORKSPACE_RESOURCE_GRID_TEMPLATE_COLUMNS = "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.6fr) minmax(0, 0.8fr)";

export type WorkspaceResourceTableMenuRow = {
  id: string;
  repoLabel: string;
  workspaceLabel: string;
  cpuLabel: string;
  memoryLabel: string;
};

type WorkspaceResourceTableMenuProps = {
  anchorEl: HTMLElement | null;
  rows: WorkspaceResourceTableMenuRow[];
  summaryLabel: string;
  toggleAriaLabel: string;
  repoColumnLabel: string;
  workspaceColumnLabel: string;
  cpuColumnLabel: string;
  memoryColumnLabel: string;
  emptyLabel: string;
  onClose: () => void;
  onOpen: (anchorEl: HTMLElement) => void;
  onSelectRow: (rowId: string) => void;
};

/** Renders one stateless workspace-resource button and table-like dropdown with repo, workspace, CPU, and memory columns. */
export function WorkspaceResourceTableMenu({
  anchorEl,
  rows,
  summaryLabel,
  toggleAriaLabel,
  repoColumnLabel,
  workspaceColumnLabel,
  cpuColumnLabel,
  memoryColumnLabel,
  emptyLabel,
  onClose,
  onOpen,
  onSelectRow,
}: WorkspaceResourceTableMenuProps) {
  return (
    <TableDropdownMenu
      anchorEl={anchorEl}
      rows={rows.map((row) => ({
        id: row.id,
        cells: [
          {
            label: row.repoLabel,
            noWrap: true,
          },
          {
            label: row.workspaceLabel,
            noWrap: true,
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
        { label: repoColumnLabel },
        { label: workspaceColumnLabel },
        { label: cpuColumnLabel, align: "right" },
        { label: memoryColumnLabel, align: "right" },
      ]}
      summaryLabel={summaryLabel}
      toggleAriaLabel={toggleAriaLabel}
      emptyLabel={emptyLabel}
      gridTemplateColumns={WORKSPACE_RESOURCE_GRID_TEMPLATE_COLUMNS}
      paperMinWidth={320}
      buttonMaxWidth={180}
      onOpen={onOpen}
      onClose={onClose}
      onSelectRow={onSelectRow}
    />
  );
}
