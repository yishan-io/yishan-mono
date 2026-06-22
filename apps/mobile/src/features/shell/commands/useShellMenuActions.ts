import type { Workspace } from "@/features/workspaces/workspaces.types";
import type { useShellSheets } from "../hooks/useShellSheets";
import { workspaceSidebarLabel } from "../view-model/shell-labels";
import {
  type OpenWorkspaceBrowserInput,
  buildProjectMenuActions,
  buildWorkspaceBrowserInputFromWorkspace,
  buildWorkspaceMenuActions,
} from "./shell-action-builders";
import type { useShellMutations } from "./useShellMutations";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useShellMenuActions({
  createTerminal,
  currentOrganizationId,
  mutations,
  openWorkspaceBrowser,
  sheets,
  t,
}: {
  createTerminal: (workspace: Workspace) => void;
  currentOrganizationId: string | null;
  mutations: ReturnType<typeof useShellMutations>;
  openWorkspaceBrowser: (context: OpenWorkspaceBrowserInput) => void;
  sheets: ReturnType<typeof useShellSheets>;
  t: Translate;
}) {
  const projectMenuProject = sheets.projectMenuProject;
  const projectMenuOrganizationId = sheets.projectMenuOrganizationId;
  const workspaceMenuContext = sheets.workspaceMenuContext;

  const projectMenuActions =
    projectMenuProject && projectMenuOrganizationId
      ? buildProjectMenuActions({
          createWorkspaceLabel: t("shell.newWorkspace"),
          deleteProjectLabel: t("shell.deleteProject"),
          onDeleteProject: () => mutations.deleteProjectAction(projectMenuProject, projectMenuOrganizationId),
          onOpenWorkspaceCreate: () => sheets.openWorkspaceCreate(projectMenuProject),
        })
      : [];

  const workspaceMenuActions = workspaceMenuContext
    ? buildWorkspaceMenuActions({
        closeWorkspaceLabel: t("shell.closeWorkspace"),
        newTerminalLabel: t("shell.newTerminal"),
        onCloseWorkspace: () => {
          const { project, workspace } = workspaceMenuContext;
          mutations.closeWorkspaceAction(project, workspace);
        },
        onCreateTerminal: () => {
          const { workspace } = workspaceMenuContext;
          sheets.closeWorkspaceMenu();
          createTerminal(workspace);
        },
        onOpenFileTree: () => {
          const { project, workspace } = workspaceMenuContext;
          sheets.closeWorkspaceMenu();
          openWorkspaceBrowser(
            buildWorkspaceBrowserInputFromWorkspace({
              projectLabel: project.name,
              tab: "files",
              terminalLabel: null,
              workspace,
              workspaceLabel: workspaceSidebarLabel(workspace, t),
            }),
          );
        },
        viewFileTreeLabel: t("shell.viewFileTree"),
      })
    : [];

  return {
    onOpenProjectCreate: () => sheets.openProjectCreate(currentOrganizationId),
    projectMenuActions,
    workspaceMenuActions,
  };
}
