import { Box } from "@mui/material";
import type { WorkspaceItem } from "@renderer/domains/workspace";
import type { TFunction } from "i18next";
import { LuSettings, LuTrash2 } from "react-icons/lu";
import {
  type ExternalAppId,
  type ExternalAppMenuEntry,
  findExternalAppPreset,
} from "../../../../shared/contracts/externalApps";
import { ContextMenu, type ContextMenuEntry } from "../../../ui/components/ContextMenu";

type ProjectListContextMenusProps = {
  t: TFunction;
  projectContextMenu: { repoId: string } | null;
  workspaceContextMenu: { repoId: string; workspaceId: string } | null;
  workspaces: WorkspaceItem[];
  displayWorkspaceIdByProjectId: Record<string, string>;
  canOpenWorkspaceInExternalApp: boolean;
  externalAppMenuEntries: readonly ExternalAppMenuEntry[];
  lastUsedWorkspaceExternalAppPreset: { id: ExternalAppId; label: string; iconSrc: string } | null;
  openWorkspaceInLastUsedExternalAppActionLabel: string;
  openWorkspaceInFileManagerActionLabel: string;
  closeAllContextMenus: () => void;
  closeWorkspaceMenus: () => void;
  handleOpenProjectConfig: (projectId: string) => void;
  handleRequestProjectDeletion: (projectId: string) => void;
  handleRequestWorkspaceDeletion: (projectId: string, workspaceId: string) => void;
  handleDeleteLocalFolder: (folderId: string) => void;
  handleOpenWorkspaceInExternalApp: (appId: ExternalAppId) => Promise<void>;
  handleOpenWorkspaceInFileManager: () => Promise<void>;
  setRenameWorkspaceContext: (value: { projectId: string; workspaceId: string } | null) => void;
  projectContextMenuAnchorPosition: { top: number; left: number } | undefined;
  workspaceContextMenuAnchorPosition: { top: number; left: number } | undefined;
};

export function ProjectListContextMenus({
  t,
  projectContextMenu,
  workspaceContextMenu,
  workspaces,
  displayWorkspaceIdByProjectId,
  canOpenWorkspaceInExternalApp,
  externalAppMenuEntries,
  lastUsedWorkspaceExternalAppPreset,
  openWorkspaceInLastUsedExternalAppActionLabel,
  openWorkspaceInFileManagerActionLabel,
  closeAllContextMenus,
  closeWorkspaceMenus,
  handleOpenProjectConfig,
  handleRequestProjectDeletion,
  handleRequestWorkspaceDeletion,
  handleDeleteLocalFolder,
  handleOpenWorkspaceInExternalApp,
  handleOpenWorkspaceInFileManager,
  setRenameWorkspaceContext,
  projectContextMenuAnchorPosition,
  workspaceContextMenuAnchorPosition,
}: ProjectListContextMenusProps) {
  const projectContextMenuItems: ContextMenuEntry[] = [
    {
      id: "repo-config",
      label: t("project.actions.config"),
      icon: <LuSettings size={14} />,
      onSelect: () => {
        if (!projectContextMenu) {
          return;
        }

        handleOpenProjectConfig(projectContextMenu.repoId);
      },
    },
    {
      id: "repo-delete",
      label: t("project.actions.delete"),
      icon: <LuTrash2 size={14} />,
      onSelect: () => {
        if (!projectContextMenu) {
          return;
        }

        handleRequestProjectDeletion(projectContextMenu.repoId);
      },
    },
  ];

  const workspaceExternalAppItems: ContextMenuEntry[] = externalAppMenuEntries.reduce<ContextMenuEntry[]>(
    (items, entry) => {
      if (entry.kind === "app") {
        const appPreset = findExternalAppPreset(entry.appId);
        if (!appPreset) {
          return items;
        }

        items.push({
          id: appPreset.id,
          label: appPreset.label,
          icon: <Box component="img" src={appPreset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
          onSelect: () => {
            void handleOpenWorkspaceInExternalApp(appPreset.id);
          },
        });
        return items;
      }

      const jetBrainsItems: ContextMenuEntry[] = entry.appIds.reduce<ContextMenuEntry[]>((childItems, appId) => {
        const appPreset = findExternalAppPreset(appId);
        if (!appPreset) {
          return childItems;
        }

        childItems.push({
          id: appPreset.id,
          label: appPreset.label,
          icon: <Box component="img" src={appPreset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
          onSelect: () => {
            void handleOpenWorkspaceInExternalApp(appPreset.id);
          },
        });
        return childItems;
      }, []);

      items.push({
        id: `group-${entry.id}`,
        label: entry.label,
        icon: <Box component="img" src={entry.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
        items: jetBrainsItems,
      });
      return items;
    },
    [],
  );

  const workspaceContextTarget =
    workspaceContextMenu &&
    workspaces.find(
      (workspace) =>
        workspace.id === workspaceContextMenu.workspaceId &&
        // Folder rows carry projectId = "local-folder" (repoId = folder id),
        // while git workspace rows carry repoId = project id. Accept either
        // identity field so folder rows resolve to a context target.
        (workspace.repoId === workspaceContextMenu.repoId || workspace.projectId === workspaceContextMenu.repoId),
    );
  const isWorkspaceContextTargetLocal = Boolean(
    workspaceContextTarget &&
      (workspaceContextTarget.kind === "local" ||
        displayWorkspaceIdByProjectId[workspaceContextTarget.repoId] === workspaceContextTarget.id),
  );
  const isWorkspaceContextTargetFolder = Boolean(workspaceContextTarget?.kind === "folder");
  const hasWorkspaceExternalAppItems = workspaceExternalAppItems.length > 0;

  const workspaceContextMenuItems: ContextMenuEntry[] = [
    {
      id: "workspace-open-in-file-manager",
      label: openWorkspaceInFileManagerActionLabel,
      onSelect: () => {
        void handleOpenWorkspaceInFileManager();
      },
    },
    ...(!isWorkspaceContextTargetFolder &&
    canOpenWorkspaceInExternalApp &&
    hasWorkspaceExternalAppItems &&
    lastUsedWorkspaceExternalAppPreset
      ? [
          {
            id: "workspace-open-last-used-external-app",
            label: openWorkspaceInLastUsedExternalAppActionLabel,
            endAdornment: (
              <Box
                component="img"
                src={lastUsedWorkspaceExternalAppPreset.iconSrc}
                alt=""
                sx={{ width: 16, height: 16, ml: 1 }}
              />
            ),
            onSelect: () => {
              void handleOpenWorkspaceInExternalApp(lastUsedWorkspaceExternalAppPreset.id);
            },
          },
        ]
      : []),
    ...(!isWorkspaceContextTargetFolder && canOpenWorkspaceInExternalApp && hasWorkspaceExternalAppItems
      ? [
          {
            id: "workspace-open-external-app-submenu",
            label: t("workspace.actions.openInExternalApp"),
            items: workspaceExternalAppItems,
          },
        ]
      : []),
    ...(workspaceContextMenu && !isWorkspaceContextTargetLocal && !isWorkspaceContextTargetFolder
      ? [
          {
            id: "workspace-rename",
            label: t("workspace.actions.rename"),
            onSelect: () => {
              if (!workspaceContextMenu) {
                return;
              }

              const workspace = workspaces.find((item) => item.id === workspaceContextMenu.workspaceId);
              const isWorkspaceDisplayedAsLocal =
                workspace?.kind === "local" ||
                (workspace ? displayWorkspaceIdByProjectId[workspace.repoId] === workspace.id : false);
              if (!workspace || isWorkspaceDisplayedAsLocal) {
                return;
              }

              closeWorkspaceMenus();
              setRenameWorkspaceContext({ projectId: workspace.repoId, workspaceId: workspace.id });
            },
          },
          {
            id: "workspace-delete",
            label: t("workspace.actions.delete"),
            onSelect: () => {
              if (!workspaceContextMenu) {
                return;
              }

              handleRequestWorkspaceDeletion(workspaceContextMenu.repoId, workspaceContextMenu.workspaceId);
            },
          },
        ]
      : []),
    ...(workspaceContextMenu && isWorkspaceContextTargetFolder
      ? [
          {
            id: "workspace-folder-delete",
            label: t("workspace.actions.deleteFolder"),
            onSelect: () => {
              if (!workspaceContextMenu) {
                return;
              }

              handleDeleteLocalFolder(workspaceContextMenu.workspaceId);
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <ContextMenu
        open={Boolean(projectContextMenu)}
        onClose={closeAllContextMenus}
        anchorPosition={projectContextMenuAnchorPosition}
        items={projectContextMenuItems}
      />
      <ContextMenu
        open={Boolean(workspaceContextMenu)}
        onClose={closeWorkspaceMenus}
        anchorPosition={workspaceContextMenuAnchorPosition}
        items={workspaceContextMenuItems}
      />
    </>
  );
}
