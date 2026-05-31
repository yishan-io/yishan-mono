import { Box } from "@mui/material";
import { useState } from "react";
import { LuGlobe } from "react-icons/lu";
import type { PaneLeaf, SplitPaneNode } from "../../store/split-pane";
import type { WorkspaceTab } from "../../store/types";

export function FaviconIcon({ url, size }: { url?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <LuGlobe size={size} />;
  }
  return (
    <Box
      component="img"
      src={url}
      alt=""
      sx={{ width: size, height: size, flexShrink: 0, objectFit: "contain" }}
      onError={() => setFailed(true)}
    />
  );
}

export function collectPaneLeaves(node: SplitPaneNode | null | undefined): PaneLeaf[] {
  if (!node) {
    return [];
  }
  if (node.kind === "leaf") {
    return [node];
  }
  return [...collectPaneLeaves(node.first), ...collectPaneLeaves(node.second)];
}

/** Converts a full WorkspaceTab to the lightweight descriptor used by TabBar/SplitPaneGroup. */
export function toTabBarDescriptor(tab: WorkspaceTab) {
  return {
    id: tab.id,
    title: tab.title,
    pinned: tab.pinned,
    kind: tab.kind,
    isDirty: tab.kind === "file" ? tab.data.isDirty : false,
    isTemporary: ["file", "image", "diff"].includes(tab.kind)
      ? (tab.data as { isTemporary: boolean }).isTemporary
      : false,
  };
}
