import { FlatList, RefreshControl, View } from "react-native";
import { Paragraph } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { ProjectNodeGroup } from "@/features/shell/state/shell-workspace-tree";
import { SIDEBAR_TREE_INDENT } from "@/features/shell/state/shell.constants";
import type { ShellSelection } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { NodeSidebarNode, ProjectSidebarNode, WorkspaceSidebarNode } from "./RepoSidebarNode";

type RepositoriesByProjectListProps = {
  foldedNodeIds: string[];
  foldedProjectRowIds: string[];
  isReadOnly: boolean;
  noProjectsLabel: string;
  onOpenProjectMenu: (projectId: string) => void;
  onOpenWorkspaceMenu: (projectId: string, workspace: Workspace) => void;
  onRefreshProjects?: (() => void) | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onToggleNodeFold: (nodeRowId: string) => void;
  onToggleProjectFold: (projectId: string) => void;
  projectGroups: ProjectNodeGroup[];
  refreshingProjects: boolean;
  selectedSelection: Extract<ShellSelection, { kind: "workspace" }> | null;
};

export function RepositoriesByProjectList({
  foldedNodeIds,
  foldedProjectRowIds,
  isReadOnly,
  noProjectsLabel,
  onOpenProjectMenu,
  onOpenWorkspaceMenu,
  onRefreshProjects,
  onSelectWorkspace,
  onToggleNodeFold,
  onToggleProjectFold,
  projectGroups,
  refreshingProjects,
  selectedSelection,
}: RepositoriesByProjectListProps) {
  const refreshControl = onRefreshProjects ? (
    <RefreshControl onRefresh={onRefreshProjects} refreshing={refreshingProjects} />
  ) : undefined;

  return (
    <FlatList
      alwaysBounceVertical
      bounces
      contentContainerStyle={LIST_CONTENT_CONTAINER_STYLE}
      data={projectGroups}
      keyExtractor={(item) => `project:${item.project.id}`}
      ListEmptyComponent={
        <View style={INLINE_MESSAGE_INSET}>
          <Paragraph>{noProjectsLabel}</Paragraph>
        </View>
      }
      refreshControl={refreshControl}
      removeClippedSubviews
      renderItem={({ item }) => (
        <ProjectSidebarNode
          folded={foldedProjectRowIds.includes(item.project.id)}
          onOpenMenu={() => onOpenProjectMenu(item.project.id)}
          onToggleFold={() => onToggleProjectFold(item.project.id)}
          project={item.project}
          selectedSelection={selectedSelection}
          showMenuActions={!isReadOnly}
        >
          {item.nodes.map((nodeGroup) => {
            const nodeRowId = `${item.project.id}:${nodeGroup.nodeId}`;
            return (
              <NodeSidebarNode
                key={nodeRowId}
                folded={foldedNodeIds.includes(nodeRowId)}
                indent={SIDEBAR_TREE_INDENT}
                nodeKind={nodeGroup.nodeKind}
                nodeName={nodeGroup.nodeName}
                nodeScope={nodeGroup.nodeScope}
                onToggleFold={() => onToggleNodeFold(nodeRowId)}
              >
                {nodeGroup.workspaces.map((workspace) => (
                  <WorkspaceSidebarNode
                    key={workspace.id}
                    onOpenMenu={() => onOpenWorkspaceMenu(item.project.id, workspace)}
                    onSelectWorkspace={() => onSelectWorkspace(workspace)}
                    selected={selectedSelection?.workspaceId === workspace.id}
                    showMenuActions={!isReadOnly && workspace.kind !== "primary"}
                    workspace={workspace}
                  />
                ))}
              </NodeSidebarNode>
            );
          })}
        </ProjectSidebarNode>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

const LIST_CONTENT_CONTAINER_STYLE = { flexGrow: 1, gap: 8, paddingBottom: 24 } as const;
const INLINE_MESSAGE_INSET = { paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX } as const;
