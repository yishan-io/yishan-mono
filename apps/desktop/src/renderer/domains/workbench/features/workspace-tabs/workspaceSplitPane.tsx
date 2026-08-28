import { Box } from "@mui/material";
import { useState } from "react";
import { LuGlobe } from "react-icons/lu";
import type { PaneLeaf, SplitPaneNode } from "../../../../domains/workbench/split-pane";
import type { WorkbenchTab } from "../../../../domains/workbench/tabs";

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

export type TabBarDescriptor = {
  id: string;
  title: string;
  pinned: boolean;
  kind?: string;
  isDirty?: boolean;
  isTemporary?: boolean;
  /** Present for agent-chat tabs: pi resume/runtime session id. */
  sessionId?: string;
  /** Present for agent-chat tabs: working directory of the agent process. */
  cwd?: string;
  /** Present for agent-chat tabs: selected session runtime. */
  runtime?: "pi" | "dsh";
};

/** Converts a full WorkbenchTab to the lightweight descriptor used by TabBar/SplitPaneGroup. */
export function toTabBarDescriptor(tab: WorkbenchTab): TabBarDescriptor {
  return {
    id: tab.id,
    title: tab.title,
    pinned: tab.pinned,
    kind: tab.kind,
    isDirty: tab.kind === "file" ? tab.data.isDirty : false,
    isTemporary: ["file", "image", "diff"].includes(tab.kind)
      ? (tab.data as { isTemporary: boolean }).isTemporary
      : false,
    sessionId: tab.kind === "agent-chat" ? tab.data.sessionId : undefined,
    cwd: tab.kind === "agent-chat" ? tab.data.cwd : undefined,
    runtime: tab.kind === "agent-chat" ? tab.data.runtime : undefined,
  };
}
