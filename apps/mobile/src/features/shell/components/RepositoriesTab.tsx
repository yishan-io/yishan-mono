import { memo, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { View } from "react-native";
import { Paragraph } from "tamagui";

import { ErrorState } from "@/components/ui/ErrorState";
import { TransientNoticePill } from "@/components/ui/TransientNoticePill";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useActionCompletionNotice } from "@/components/ui/useActionCompletionNotice";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { Node } from "@/features/nodes/nodes.types";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import {
  type WorkspaceListHierarchyMode,
  buildNodeWorkspaceGroups,
  buildProjectNodeGroups,
} from "@/features/shell/state/shell-workspace-tree";
import type { ShellSelection } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { RepositoriesByNodeList } from "./RepositoriesByNodeList";
import { RepositoriesByProjectList } from "./RepositoriesByProjectList";

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
  const projects = currentProjects ?? [];
  const [foldedNodeIds, setFoldedNodeIds] = useState<string[]>([]);
  const [foldedProjectRowIds, setFoldedProjectRowIds] = useState<string[]>([]);
  const visibleProjects = useMemo(
    () => projects.filter((project) => displayProjectIds.includes(project.id)),
    [displayProjectIds, projects],
  );
  const visibleProjectById = useMemo(
    () => new Map(visibleProjects.map((project) => [project.id, project])),
    [visibleProjects],
  );
  const { handleAction: handleRefresh, showNotice: showRefreshNotice } = useActionCompletionNotice({
    hasError: isProjectsError,
    isRefreshing: refreshingProjects,
    onAction: onRefreshProjects,
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

  if (organizationCount === 0) {
    return (
      <View style={INLINE_MESSAGE_INSET}>
        <Paragraph>{t("shell.orgProjectsEmptyMessage")}</Paragraph>
      </View>
    );
  }

  if (isProjectsLoading) {
    return (
      <View style={INLINE_MESSAGE_INSET}>
        <Paragraph>{t("shell.loadingProjects")}</Paragraph>
      </View>
    );
  }

  if (isProjectsError) {
    return <ErrorState onRetry={onRetryProjects} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {showRefreshNotice ? <TransientNoticePill label={t("shell.workspaceTreeRefreshed")} /> : null}
      {workspaceListHierarchyMode === "by_node" ? (
        <RepositoriesByNodeList
          foldedNodeIds={foldedNodeIds}
          foldedProjectRowIds={foldedProjectRowIds}
          isReadOnly={isReadOnly}
          nodeGroups={nodeGroups}
          noProjectsLabel={t("shell.noProjectsYet")}
          onOpenProjectMenu={(projectId) => {
            const project = visibleProjectById.get(projectId);
            if (project) {
              onOpenProjectMenu(project);
            }
          }}
          onOpenWorkspaceMenu={(projectId, workspace) => {
            const project = visibleProjectById.get(projectId);
            if (project) {
              onOpenWorkspaceMenu(project, workspace);
            }
          }}
          onRefreshProjects={handleRefresh}
          onSelectWorkspace={onSelectWorkspace}
          onToggleNodeFold={(nodeId) => toggleFoldedRow(nodeId, setFoldedNodeIds)}
          onToggleProjectFold={(projectRowId) => toggleFoldedRow(projectRowId, setFoldedProjectRowIds)}
          refreshingProjects={refreshingProjects}
          selectedSelection={selectedSelection}
        />
      ) : (
        <RepositoriesByProjectList
          foldedNodeIds={foldedNodeIds}
          foldedProjectRowIds={foldedProjectRowIds}
          isReadOnly={isReadOnly}
          noProjectsLabel={t("shell.noProjectsYet")}
          onOpenProjectMenu={(projectId) => {
            const project = visibleProjectById.get(projectId);
            if (project) {
              onOpenProjectMenu(project);
            }
          }}
          onOpenWorkspaceMenu={(projectId, workspace) => {
            const project = visibleProjectById.get(projectId);
            if (project) {
              onOpenWorkspaceMenu(project, workspace);
            }
          }}
          onRefreshProjects={handleRefresh}
          onSelectWorkspace={onSelectWorkspace}
          onToggleNodeFold={(nodeRowId) => toggleFoldedRow(nodeRowId, setFoldedNodeIds)}
          onToggleProjectFold={(projectId) => toggleFoldedRow(projectId, setFoldedProjectRowIds)}
          projectGroups={projectGroups}
          refreshingProjects={refreshingProjects}
          selectedSelection={selectedSelection}
        />
      )}
    </View>
  );
});

const INLINE_MESSAGE_INSET = { paddingHorizontal: MOBILE_UI_TOKENS.pane.insetX } as const;

function toggleFoldedRow(rowId: string, setFoldedRowIds: Dispatch<SetStateAction<string[]>>) {
  setFoldedRowIds((current) => (current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]));
}
