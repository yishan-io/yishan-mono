import type { useShellSheets } from "../hooks/useShellSheets";
import { buildProjectMenuActions, buildWorkspaceMenuActions } from "./shell-action-builders";
import type { useShellMutations } from "./useShellMutations";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function useShellMenuActions({
  currentOrganizationId,
  mutations,
  sheets,
  t,
}: {
  currentOrganizationId: string | null;
  mutations: ReturnType<typeof useShellMutations>;
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
        onCloseWorkspace: () => {
          const { project, workspace } = workspaceMenuContext;
          mutations.closeWorkspaceAction(project, workspace);
        },
      })
    : [];

  return {
    onOpenProjectCreate: () => sheets.openProjectCreate(currentOrganizationId),
    projectMenuActions,
    workspaceMenuActions,
  };
}
