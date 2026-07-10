import { FlatList, RefreshControl, View } from "react-native";
import { Paragraph } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { NodeWorkspaceGroup } from "@/features/shell/state/shell-workspace-tree";
import { SIDEBAR_TREE_INDENT } from "@/features/shell/state/shell.constants";
import type { ShellSelection } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { NodeSidebarNode, ProjectSidebarNode, WorkspaceSidebarNode } from "./RepoSidebarNode";

type RepositoriesByNodeListProps = {
  foldedNodeIds: string[];
  foldedProjectRowIds: string[];
  isReadOnly: boolean;
  nodeGroups: NodeWorkspaceGroup[];
  noProjectsLabel: string;
  onOpenProjectMenu: (projectId: string) => void;
  onOpenWorkspaceMenu: (projectId: string, workspace: Workspace) => void;
  onRefreshProjects?: (() => void) | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  onToggleNodeFold: (nodeId: string) => void;
  onToggleProjectFold: (projectRowId: string) => void;
  refreshingProjects: boolean;
  selectedSelection: Extract<ShellSelection, { kind: "workspace" }> | null;
};

export function RepositoriesByNodeList({
  foldedNodeIds,
  foldedProjectRowIds,
  isReadOnly,
  nodeGroups,
  noProjectsLabel,
  onOpenProjectMenu,
  onOpenWorkspaceMenu,
  onRefreshProjects,
  onSelectWorkspace,
  onToggleNodeFold,
  onToggleProjectFold,
  refreshingProjects,
  selectedSelection,
}: RepositoriesByNodeListProps) {
  const refreshControl = onRefreshProjects ? (
    <RefreshControl onRefresh={onRefreshProjects} refreshing={refreshingProjects} />
  ) : undefined;

  return (
    <FlatList
      alwaysBounceVertical
      bounces
      contentContainerStyle={LIST_CONTENT_CONTAINER_STYLE}
      data={nodeGroups}
      keyExtractor={(item) => `node:${item.nodeId}`}
      ListEmptyComponent={
        <View style={INLINE_MESSAGE_INSET}>
          <Paragraph>{noProjectsLabel}</Paragraph>
        </View>
      }
      refreshControl={refreshControl}
      removeClippedSubviews
      renderItem={({ item }) => (
        <NodeSidebarNode
          folded={foldedNodeIds.includes(item.nodeId)}
          nodeKind={item.nodeKind}
          nodeName={item.nodeName}
          nodeScope={item.nodeScope}
          onToggleFold={() => onToggleNodeFold(item.nodeId)}
        >
          {item.projects.map(({ project, workspaces }) => {
            const projectRowId = `${item.nodeId}:${project.id}`;
            return (
              <ProjectSidebarNode
                key={projectRowId}
                folded={foldedProjectRowIds.includes(projectRowId)}
                indent={SIDEBAR_TREE_INDENT}
                onOpenMenu={() => onOpenProjectMenu(project.id)}
                onToggleFold={() => onToggleProjectFold(projectRowId)}
                project={project}
                selectedSelection={selectedSelection}
                showMenuActions={!isReadOnly}
              >
                {workspaces.map((workspace) => (
                  <WorkspaceSidebarNode
                    key={workspace.id}
                    onOpenMenu={() => onOpenWorkspaceMenu(project.id, workspace)}
                    onSelectWorkspace={() => onSelectWorkspace(workspace)}
                    selected={selectedSelection?.workspaceId === workspace.id}
                    showMenuActions={!isReadOnly && workspace.kind !== "primary"}
                    workspace={workspace}
                  />
                ))}
              </ProjectSidebarNode>
            );
          })}
        </NodeSidebarNode>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

const LIST_CONTENT_CONTAINER_STYLE = { flexGrow: 1, gap: 8, paddingBottom: 24 } as const;
const INLINE_MESSAGE_INSET = { paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX } as const;
