/** Split direction for a branch node in the layout tree. */
export type SplitDirection = "horizontal" | "vertical";

/** A leaf node representing one pane group that holds tab ids. */
export type PaneLeaf = {
  kind: "leaf";
  id: string;
  tabIds: string[];
  selectedTabId: string;
};

/** A branch node that splits space between two children. */
export type PaneBranch = {
  kind: "branch";
  id: string;
  direction: SplitDirection;
  /** Proportion allocated to the first child (0..1). */
  ratio: number;
  first: SplitPaneNode;
  second: SplitPaneNode;
};

/** A node in the recursive split-pane layout tree. */
export type SplitPaneNode = PaneLeaf | PaneBranch;

/** The slice of state managed by the split-pane domain. */
export type SplitPaneStateSlice = {
  /** Root layout node for the active workspace. */
  root: SplitPaneNode;
  /** Which pane leaf is currently focused. */
  activePaneId: string;
};
