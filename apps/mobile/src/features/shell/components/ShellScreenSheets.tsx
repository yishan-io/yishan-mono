import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import type { useShellSheets } from "../hooks/useShellSheets";
import type { ShellState } from "../state/useShellState";
import { workspaceSidebarLabel } from "../view-model/shell-labels";
import type { ShellScreenContext } from "../view-model/useShellScreenContext";
import type { ShellScreenModel } from "../view-model/useShellScreenModel";
import { ActionMenuSheet } from "./ActionMenuSheet";
import { OrganizationSelectorSheet } from "./OrganizationSelectorSheet";
import { PaneTabSelectorSheet } from "./PaneTabSelectorSheet";
import { ProjectCreateSheet } from "./ProjectCreateSheet";
import { ShellQuickActionsSheet } from "./ShellQuickActionsSheet";
import { WorkspaceCreateSheet } from "./WorkspaceCreateSheet";

type ShellScreenSheetsProps = {
  screenContext: ShellScreenContext;
  screenModel: ShellScreenModel;
  sheets: ReturnType<typeof useShellSheets>;
  shell: ShellState;
};

export function ShellScreenSheets({ screenContext, screenModel, sheets, shell }: ShellScreenSheetsProps) {
  const { t } = useAppLanguage();

  return (
    <>
      <PaneTabSelectorSheet
        activePaneTabId={shell.activePaneTab?.id ?? null}
        onClose={screenModel.closePaneTabSheet}
        onClosePaneTab={screenModel.closePaneTab}
        onRenameTerminal={screenModel.renameTerminal}
        onSelectPaneTab={shell.selectPaneTab}
        open={screenModel.isPaneTabSheetOpen}
        terminalsById={screenModel.terminalsById}
        tabs={shell.paneTabs}
      />

      <ShellQuickActionsSheet
        agentQuickActions={screenModel.agentQuickActions}
        onClose={sheets.closeQuickActions}
        onCreateTerminal={screenModel.createTerminalHandler}
        onOpenChanges={screenModel.openChangesHandler}
        onOpenFiles={screenModel.openFilesHandler}
        onOpenPullRequests={screenModel.openPullRequestsHandler}
        open={sheets.quickActionsOpen}
      />

      <OrganizationSelectorSheet
        currentOrganizationId={screenContext.currentOrganizationId}
        onClose={sheets.closeOrgSelector}
        onSelectOrganization={screenModel.selectOrganization}
        open={sheets.orgSelectorOpen}
        organizations={screenContext.organizations}
        title={t("shell.organizations")}
      />

      <ProjectCreateSheet
        onClose={sheets.closeProjectCreate}
        open={!!sheets.projectCreateOrganizationId}
        organizationId={sheets.projectCreateOrganizationId}
      />
      <WorkspaceCreateSheet
        currentNodeId={screenContext.currentNodeId}
        currentNodes={screenContext.currentNodes}
        onClose={sheets.closeWorkspaceCreate}
        onCreatedWorkspace={shell.selectWorkspace}
        open={!!sheets.workspaceCreateProject}
        project={sheets.workspaceCreateProject}
      />
      <ActionMenuSheet
        actions={screenModel.projectMenuActions}
        onClose={sheets.closeProjectMenu}
        open={!!sheets.projectMenuProject}
        title={sheets.projectMenuProject?.name ?? ""}
      />

      <ActionMenuSheet
        actions={screenModel.workspaceMenuActions}
        onClose={sheets.closeWorkspaceMenu}
        open={!!sheets.workspaceMenuContext}
        title={sheets.workspaceMenuContext ? workspaceSidebarLabel(sheets.workspaceMenuContext.workspace, t) : ""}
      />
    </>
  );
}
