import { Box } from "@mui/material";
import { useCallback, useRef } from "react";
import type { PaneBranch, PaneLeaf, SplitPaneNode } from "../store/split-pane";
import { ColumnSeparator } from "./ColumnSeparator";

type SplitPaneContainerProps = {
  node: SplitPaneNode;
  /** Renders a leaf pane. Passed through from the top-level container. */
  renderPane: (leaf: PaneLeaf) => React.ReactNode;
  /** Called when a branch separator is resized. */
  onSplitRatioChange: (branchId: string, ratio: number) => void;
};

/** Renders a branch node with a separator between two children. */
function SplitBranch({
  branch,
  renderPane,
  onSplitRatioChange,
}: {
  branch: PaneBranch;
  renderPane: (leaf: PaneLeaf) => React.ReactNode;
  onSplitRatioChange: (branchId: string, ratio: number) => void;
}) {
  const isVertical = branch.direction === "vertical";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startPos: number; startRatio: number } | null>(null);

  const handleResizeStart = useCallback(
    (clientPos: number) => {
      dragStartRef.current = { startPos: clientPos, startRatio: branch.ratio };
    },
    [branch.ratio],
  );

  const handleResizeMove = useCallback(
    (clientPos: number) => {
      const container = containerRef.current;
      const dragStart = dragStartRef.current;
      if (!container || !dragStart) return;

      const rect = container.getBoundingClientRect();
      const totalSize = isVertical ? rect.height : rect.width;
      if (totalSize <= 0) return;

      const delta = clientPos - dragStart.startPos;
      const ratioDelta = delta / totalSize;
      const nextRatio = Math.max(0.1, Math.min(0.9, dragStart.startRatio + ratioDelta));
      onSplitRatioChange(branch.id, nextRatio);
    },
    [branch.id, isVertical, onSplitRatioChange],
  );

  const handleResizeEnd = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  const firstSize = `${branch.ratio * 100}%`;
  const secondSize = `${(1 - branch.ratio) * 100}%`;

  return (
    <Box
      ref={containerRef}
      data-testid={`split-branch-${branch.id}`}
      sx={{
        display: "flex",
        flexDirection: isVertical ? "column" : "row",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Box sx={{ [isVertical ? "height" : "width"]: firstSize, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <SplitPaneContainerNode
          node={branch.first}
          renderPane={renderPane}
          onSplitRatioChange={onSplitRatioChange}
        />
      </Box>
      <ColumnSeparator
        orientation={isVertical ? "vertical" : "horizontal"}
        ariaLabel="Resize split pane"
        onResizeStart={handleResizeStart}
        onResizeMove={handleResizeMove}
        onResizeEnd={handleResizeEnd}
      />
      <Box sx={{ [isVertical ? "height" : "width"]: secondSize, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <SplitPaneContainerNode
          node={branch.second}
          renderPane={renderPane}
          onSplitRatioChange={onSplitRatioChange}
        />
      </Box>
    </Box>
  );
}

/** Recursively renders split-pane layout tree nodes. */
function SplitPaneContainerNode({
  node,
  renderPane,
  onSplitRatioChange,
}: SplitPaneContainerProps) {
  if (node.kind === "leaf") {
    return <>{renderPane(node)}</>;
  }

  return (
    <SplitBranch
      branch={node}
      renderPane={renderPane}
      onSplitRatioChange={onSplitRatioChange}
    />
  );
}

/**
 * Top-level container for the recursive split-pane layout.
 *
 * Walks the layout tree and renders each leaf as a SplitPaneGroup
 * with ColumnSeparators between split branches.
 */
export function SplitPaneContainer({
  node,
  renderPane,
  onSplitRatioChange,
}: SplitPaneContainerProps) {
  return (
    <Box sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <SplitPaneContainerNode
        node={node}
        renderPane={renderPane}
        onSplitRatioChange={onSplitRatioChange}
      />
    </Box>
  );
}
