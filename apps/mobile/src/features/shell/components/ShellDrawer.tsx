import type { ReactNode } from "react";
import { Animated, type PanResponderInstance, Pressable, View } from "react-native";
import { useTheme } from "tamagui";

import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import type { Node } from "@/features/nodes/nodes.types";
import type { WorkspaceAggregateIndicator } from "@/features/notifications/notification-runtime-context";
import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";
import type { ShellSelection } from "@/features/shell/state/shell.types";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { useWorkspaceTreeFilterModel } from "../view-model/useWorkspaceTreeFilterModel";
import { RepositoriesTab } from "./RepositoriesTab";
import { ShellDrawerPanelHeader, ShellTopBar } from "./ShellDrawerHeader";
import { WorkspaceTreeFilterSheet } from "./WorkspaceTreeFilterSheet";

export type ShellDrawerTopBarModel = {
  aggregateIndicator?: WorkspaceAggregateIndicator;
  onOpenBrowser?: (() => void) | null;
  onOpenQuickActions?: (() => void) | null;
  onRefreshSessions?: (() => void) | null;
  refreshingSessions?: boolean;
  subtitle?: string | null;
  subtitleLeading?: ReactNode;
  title: string;
};

export type ShellDrawerPanelModel = {
  currentNodes: Node[];
  currentOrganizationId: string | null;
  currentOrganizationName: string;
  currentProjects: ProjectWithWorkspaces[] | undefined;
  isProjectsError: boolean;
  isProjectsLoading: boolean;
  isReadOnly?: boolean;
  onOpenProfileControls: () => void;
  onOpenOrganizationSelector: () => void;
  onOpenProjectMenu: (project: ProjectWithWorkspaces) => void;
  onRefreshWorkspaceTree?: (() => void) | null;
  onOpenWorkspaceMenu: (project: ProjectWithWorkspaces, workspace: Workspace) => void;
  onRetryProjects?: () => void;
  organizationCount: number;
  refreshingWorkspaceTree?: boolean;
  selectedSelection: Extract<ShellSelection, { kind: "workspace" }> | null;
  userAvatarUrl?: string | null;
  userName: string;
  workspacesByProjectId?: Record<string, Workspace[]>;
};

type ShellDrawerProps = {
  closeDrawer: (onClosed?: () => void) => void;
  drawerPanHandlers: PanResponderInstance["panHandlers"];
  drawerTranslateX: Animated.Value;
  onSelectWorkspace: (workspace: Workspace) => void;
  openDrawer: () => void;
  overlayOpacity: Animated.Value;
  panel: ShellDrawerPanelModel;
  topBar: ShellDrawerTopBarModel;
  visible: boolean;
};

export function ShellDrawer({
  closeDrawer,
  drawerPanHandlers,
  drawerTranslateX,
  onSelectWorkspace,
  openDrawer,
  overlayOpacity,
  panel,
  topBar,
  visible,
}: ShellDrawerProps) {
  const theme = useTheme();
  const currentOrganizationId = panel.currentOrganizationId;
  const projects = panel.currentProjects ?? [];
  const workspaceTreeFilter = useWorkspaceTreeFilterModel({
    currentOrganizationId,
    projects,
  });

  return (
    <>
      <ShellTopBar
        aggregateIndicator={topBar.aggregateIndicator}
        onOpenBrowser={topBar.onOpenBrowser}
        onOpenQuickActions={topBar.onOpenQuickActions}
        onOpenDrawer={openDrawer}
        onRefreshSessions={topBar.onRefreshSessions}
        refreshingSessions={topBar.refreshingSessions}
        subtitle={topBar.subtitle}
        subtitleLeading={topBar.subtitleLeading}
        title={topBar.title}
      />

      {visible ? (
        <View
          style={{
            bottom: 0,
            elevation: 20,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
            zIndex: 20,
          }}
        >
          <Animated.View
            style={{
              backgroundColor: MOBILE_UI_TOKENS.sheet.backdrop,
              bottom: 0,
              left: 0,
              opacity: overlayOpacity,
              pointerEvents: "none",
              position: "absolute",
              right: 0,
              top: 0,
              zIndex: 0,
            }}
          />
          <Pressable
            onPress={() => closeDrawer()}
            style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
          />
          <Animated.View
            {...drawerPanHandlers}
            style={{
              backgroundColor: theme.background.val,
              bottom: 0,
              gap: 16,
              left: 0,
              paddingHorizontal: 16,
              paddingVertical: 20,
              position: "absolute",
              top: 0,
              transform: [{ translateX: drawerTranslateX }],
              width: "100%",
              zIndex: 1,
            }}
          >
            <ShellDrawerPanelHeader
              currentOrganizationName={panel.currentOrganizationName}
              organizationCount={panel.organizationCount}
              onOpenProfileControls={panel.onOpenProfileControls}
              onOpenOrganizationSelector={panel.onOpenOrganizationSelector}
              onOpenWorkspaceTreeFilter={projects.length > 0 ? workspaceTreeFilter.openSheet : null}
              userAvatarUrl={panel.userAvatarUrl}
              userName={panel.userName}
            />
            <View
              style={{
                flex: 1,
              }}
            >
              <RepositoriesTab
                currentNodes={panel.currentNodes}
                currentProjects={panel.currentProjects}
                displayProjectIds={workspaceTreeFilter.displayProjectIds}
                isProjectsError={panel.isProjectsError}
                isProjectsLoading={panel.isProjectsLoading}
                isReadOnly={panel.isReadOnly ?? false}
                onOpenProjectMenu={panel.onOpenProjectMenu}
                onRefreshProjects={panel.onRefreshWorkspaceTree}
                onRetryProjects={panel.onRetryProjects}
                onOpenWorkspaceMenu={panel.onOpenWorkspaceMenu}
                onSelectWorkspace={(workspace) => {
                  closeDrawer(() => onSelectWorkspace(workspace));
                }}
                organizationCount={panel.organizationCount}
                refreshingProjects={panel.refreshingWorkspaceTree}
                selectedSelection={panel.selectedSelection}
                workspaceListHierarchyMode={workspaceTreeFilter.workspaceListHierarchyMode}
                workspacesByProjectId={panel.workspacesByProjectId}
              />
            </View>
          </Animated.View>
          <WorkspaceTreeFilterSheet
            displayProjectIds={workspaceTreeFilter.displayProjectIds}
            onClose={workspaceTreeFilter.close}
            onSelectAllProjects={() => workspaceTreeFilter.setDisplayProjectIds(projects.map((project) => project.id))}
            onSetHierarchyMode={workspaceTreeFilter.setWorkspaceListHierarchyMode}
            onSetProjectQuickSearch={workspaceTreeFilter.setProjectQuickSearch}
            onToggleProjectId={(projectId) =>
              workspaceTreeFilter.setDisplayProjectIds((current) =>
                current.includes(projectId) ? current.filter((item) => item !== projectId) : [...current, projectId],
              )
            }
            open={workspaceTreeFilter.open}
            projectQuickSearch={workspaceTreeFilter.projectQuickSearch}
            projects={workspaceTreeFilter.filteredProjects}
            workspaceListHierarchyMode={workspaceTreeFilter.workspaceListHierarchyMode}
          />
        </View>
      ) : null}
    </>
  );
}
