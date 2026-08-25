import { Box } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { LocalTask, LocalTaskTagCatalogEntry, LocalTaskWorkspaceLink } from "../../localTaskTypes";
import { WorkspaceTaskLinkRow } from "./WorkspaceTaskLinkRow";

const LINK_ROW_ESTIMATED_HEIGHT = 44;
const MAX_LIST_HEIGHT = 480;

type VirtualizedWorkspaceTaskLinksProps = {
  links: LocalTaskWorkspaceLink[];
  taskById: Record<string, LocalTask>;
  selectedTaskId: string | null;
  isMutationLoading: boolean;
  onSelect: (taskId: string) => void;
  tagCatalog: LocalTaskTagCatalogEntry[];
};

/** Renders workspace relationship history with bounded DOM usage while preserving row controls. */
export function VirtualizedWorkspaceTaskLinks({
  links,
  taskById,
  selectedTaskId,
  isMutationLoading,
  onSelect,
  tagCatalog,
}: VirtualizedWorkspaceTaskLinksProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: links.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINK_ROW_ESTIMATED_HEIGHT,
    overscan: 5,
  });

  return (
    <Box ref={scrollRef} sx={{ mt: 1, mx: 2, overflow: "auto", maxHeight: MAX_LIST_HEIGHT }}>
      <Box
        component="ul"
        sx={{ height: virtualizer.getTotalSize(), position: "relative", p: 0, m: 0, listStyle: "none" }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const link = links[virtualRow.index];
          if (!link) return null;
          return (
            <Box
              key={link.id}
              ref={virtualizer.measureElement}
              component="li"
              data-index={virtualRow.index}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              sx={{ position: "absolute", top: 0, left: 0, width: "100%" }}
            >
              <WorkspaceTaskLinkRow
                link={link}
                task={taskById[link.localTaskId]}
                selected={selectedTaskId === link.localTaskId}
                isMutationLoading={isMutationLoading}
                onSelect={onSelect}
                tagCatalog={tagCatalog}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
