import { Animated, type PanResponderInstance, Pressable, View } from "react-native";

import { WorkbenchPanelSurface } from "@/components/screens/WorkbenchPanelSurface";
import { MOBILE_UI_TOKENS } from "@/components/ui/ui-tokens";
import { useAppTheme } from "@/features/theme/AppThemeProvider";
import type { Workspace } from "@/features/workspaces/workspaces.types";
import { getThemeBackgroundAppColor } from "@/lib/theme/tamaguiThemes";
import type { ShellDrawerPanelModel } from "../shell-screen.types";
import { useWorkspaceTreeFilterModel } from "../view-model/useWorkspaceTreeFilterModel";
import { RepositoriesTab } from "./RepositoriesTab";
import { ShellDrawerPanelHeader } from "./ShellDrawerHeader";
import { WorkspaceTreeFilterSheet } from "./WorkspaceTreeFilterSheet";

type ShellDrawerProps = {
  closeDrawer: (onClosed?: () => void) => void;
  drawerPanHandlers: PanResponderInstance["panHandlers"];
  drawerTranslateX: Animated.Value;
  drawerWidth: number;
  onInteractionStart?: (() => void) | null;
  onSelectWorkspace: (workspace: Workspace) => void;
  overlayOpacity: Animated.Value;
  panel: ShellDrawerPanelModel;
  visible: boolean;
};

export function ShellDrawer({
  closeDrawer,
  drawerPanHandlers,
  drawerTranslateX,
  drawerWidth,
  onInteractionStart,
  onSelectWorkspace,
  overlayOpacity,
  panel,
  visible,
}: ShellDrawerProps) {
  const { resolvedTheme } = useAppTheme();
  const drawerBackgroundColor = getThemeBackgroundAppColor(resolvedTheme);
  const currentOrganizationId = panel.currentOrganizationId;
  const projects = panel.currentProjects ?? [];
  const workspaceTreeFilter = useWorkspaceTreeFilterModel({
    currentOrganizationId,
    projects,
  });

  return (
    <>
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
              backgroundColor: drawerBackgroundColor,
              bottom: 0,
              left: 0,
              position: "absolute",
              top: 0,
              transform: [{ translateX: drawerTranslateX }],
              width: drawerWidth,
              zIndex: 1,
            }}
          >
            <WorkbenchPanelSurface topInset={0}>
              <View style={{ flex: 1, minHeight: 0 }}>
                <ShellDrawerPanelHeader
                  currentOrganizationName={panel.currentOrganizationName}
                  organizationCount={panel.organizationCount}
                  onOpenProfileControls={panel.onOpenProfileControls}
                  onOpenOrganizationSelector={panel.onOpenOrganizationSelector}
                  onOpenWorkspaceTreeFilter={
                    projects.length > 0
                      ? () => {
                          onInteractionStart?.();
                          workspaceTreeFilter.openSheet();
                        }
                      : null
                  }
                  userAvatarUrl={panel.userAvatarUrl}
                  userName={panel.userName}
                />
                <View style={{ flex: 1, minHeight: 0, paddingTop: MOBILE_UI_TOKENS.pane.bodyTop }}>
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
              </View>
            </WorkbenchPanelSurface>
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
