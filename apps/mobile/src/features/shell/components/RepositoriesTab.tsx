import { memo, useMemo, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { Paragraph, Text, useTheme } from "tamagui";

import { ErrorState } from "@/components/ui/ErrorState";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import {
  type WorkspaceListHierarchyMode,
  buildNodeWorkspaceGroups,
  buildProjectNodeGroups,
} from "@/features/shell/state/shell-workspace-tree";
import { SIDEBAR_TREE_INDENT } from "@/features/shell/state/shell.constants";
import type { ShellSelection } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { NodeSidebarNode, ProjectSidebarNode, WorkspaceSidebarNode } from "./RepoSidebarNode";
import { useRepositoriesRefreshNotice } from "./useRepositoriesRefreshNotice";

type RepositoriesTabProps = {
  currentNodes: Node[];
  currentProjects: ProjectWithWorkspaces[] | undefined;
  displayProjectIds: string[];
  isProjectsError: boolean;
  isProjectsLoading: boolean;
  isReadOnly?: boolean;
  onRefreshProjects?: (() => void) | null;
  onRetryProjects?: () => void;
  onOpenProjectMenu: (project: ProjectWithWorkspaces) => void;
  onOpenWorkspaceMenu: (project: ProjectWithWorkspaces, workspace: Workspace) => void;
  onSelectWorkspace: (workspace: Workspace) => void;
  organizationCount: number;
  refreshingProjects?: boolean;
  selectedSelection: Extract<ShellSelection, { kind: "workspace" }> | null;
  workspaceListHierarchyMode: WorkspaceListHierarchyMode;
  workspacesByProjectId?: Record<string, Workspace[]>;
};

export const RepositoriesTab = memo(function RepositoriesTab({
  currentNodes,
  currentProjects,
  displayProjectIds,
  isProjectsError,
  isProjectsLoading,
  isReadOnly = false,
  onRefreshProjects,
  onRetryProjects,
  onOpenProjectMenu,
  onOpenWorkspaceMenu,
  onSelectWorkspace,
  organizationCount,
  refreshingProjects = false,
  selectedSelection,
  workspaceListHierarchyMode,
  workspacesByProjectId,
}: RepositoriesTabProps) {
  const { t } = useAppLanguage();
  const theme = useTheme();
  const projects = currentProjects ?? [];
  const [foldedNodeIds, setFoldedNodeIds] = useState<string[]>([]);
  const [foldedProjectRowIds, setFoldedProjectRowIds] = useState<string[]>([]);
  const visibleProjects = useMemo(
    () => projects.filter((project) => displayProjectIds.includes(project.id)),
    [displayProjectIds, projects],
  );
  const { handleRefresh, showRefreshNotice } = useRepositoriesRefreshNotice({
    hasError: isProjectsError,
    isRefreshing: refreshingProjects,
    onRefresh: onRefreshProjects,
  });
  // Tree projection stays in the dedicated state helper so this surface only manages fold state and rendering.
  const nodeGroups = useMemo(
    () =>
      buildNodeWorkspaceGroups({
        currentNodes,
        projects: visibleProjects,
        workspacesByProjectId,
      }),
    [currentNodes, visibleProjects, workspacesByProjectId],
  );
  const projectGroups = useMemo(
    () =>
      buildProjectNodeGroups({
        currentNodes,
        projects: visibleProjects,
        workspacesByProjectId,
      }),
    [currentNodes, visibleProjects, workspacesByProjectId],
  );

  const refreshControl = onRefreshProjects ? (
    <RefreshControl onRefresh={handleRefresh} refreshing={refreshingProjects} />
  ) : undefined;
  const listContentContainerStyle = { flexGrow: 1, gap: 8, paddingBottom: 24 };
  const inlineMessageInset = { paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX };

  if (organizationCount === 0) {
    return (
      <View style={inlineMessageInset}>
        <Paragraph>{t("shell.orgProjectsEmptyMessage")}</Paragraph>
      </View>
    );
  }

  if (isProjectsLoading) {
    return (
      <View style={inlineMessageInset}>
        <Paragraph>{t("shell.loadingProjects")}</Paragraph>
      </View>
    );
  }

  if (isProjectsError) {
    return <ErrorState onRetry={onRetryProjects} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {showRefreshNotice ? (
        <View
          style={{
            alignSelf: "center",
            backgroundColor: theme.color3.val,
            borderColor: theme.color6.val,
            borderRadius: 999,
            borderWidth: 1,
            marginBottom: 12,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <Text color="$color11" fontSize="$3" fontWeight="500">
            {t("shell.workspaceTreeRefreshed")}
          </Text>
        </View>
      ) : null}
      {workspaceListHierarchyMode === "by_node" ? (
        <FlatList
          alwaysBounceVertical
          bounces
          data={nodeGroups}
          keyExtractor={(item) => `node:${item.nodeId}`}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          contentContainerStyle={listContentContainerStyle}
          ListEmptyComponent={
            <View style={inlineMessageInset}>
              <Paragraph>{t("shell.noProjectsYet")}</Paragraph>
            </View>
          }
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <NodeSidebarNode
              folded={foldedNodeIds.includes(item.nodeId)}
              nodeKind={item.nodeKind}
              nodeName={item.nodeName}
              nodeScope={item.nodeScope}
              onToggleFold={() =>
                setFoldedNodeIds((current) =>
                  current.includes(item.nodeId)
                    ? current.filter((id) => id !== item.nodeId)
                    : [...current, item.nodeId],
                )
              }
            >
              {item.projects.map(({ project, workspaces }) => {
                const projectRowId = `${item.nodeId}:${project.id}`;
                return (
                  <ProjectSidebarNode
                    key={projectRowId}
                    folded={foldedProjectRowIds.includes(projectRowId)}
                    indent={SIDEBAR_TREE_INDENT}
                    onOpenMenu={() => onOpenProjectMenu(project)}
                    onToggleFold={() =>
                      setFoldedProjectRowIds((current) =>
                        current.includes(projectRowId)
                          ? current.filter((id) => id !== projectRowId)
                          : [...current, projectRowId],
                      )
                    }
                    project={project}
                    selectedSelection={selectedSelection}
                    showMenuActions={!isReadOnly}
                  >
                    {workspaces.map((workspace) => (
                      <WorkspaceSidebarNode
                        key={workspace.id}
                        onOpenMenu={() => onOpenWorkspaceMenu(project, workspace)}
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
        />
      ) : (
        <FlatList
          alwaysBounceVertical
          bounces
          data={projectGroups}
          keyExtractor={(item) => `project:${item.project.id}`}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          contentContainerStyle={listContentContainerStyle}
          ListEmptyComponent={
            <View style={inlineMessageInset}>
              <Paragraph>{t("shell.noProjectsYet")}</Paragraph>
            </View>
          }
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <ProjectSidebarNode
              folded={foldedProjectRowIds.includes(item.project.id)}
              onOpenMenu={() => onOpenProjectMenu(item.project)}
              onToggleFold={() =>
                setFoldedProjectRowIds((current) =>
                  current.includes(item.project.id)
                    ? current.filter((id) => id !== item.project.id)
                    : [...current, item.project.id],
                )
              }
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
                    onToggleFold={() =>
                      setFoldedNodeIds((current) =>
                        current.includes(nodeRowId)
                          ? current.filter((id) => id !== nodeRowId)
                          : [...current, nodeRowId],
                      )
                    }
                  >
                    {nodeGroup.workspaces.map((workspace) => (
                      <WorkspaceSidebarNode
                        key={workspace.id}
                        onOpenMenu={() => onOpenWorkspaceMenu(item.project, workspace)}
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
        />
      )}
    </View>
  );
});
