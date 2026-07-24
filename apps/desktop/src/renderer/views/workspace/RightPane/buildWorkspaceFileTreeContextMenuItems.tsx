import { Box } from "@mui/material";
import {
  EXTERNAL_APP_MENU_ENTRIES,
  type ExternalAppId,
  type ExternalAppPreset,
  JETBRAINS_EXTERNAL_APP_IDS,
  findExternalAppPreset,
} from "../../../../shared/contracts/externalApps";
import type { ContextMenuEntry } from "../../../components/ContextMenu";
import { buildFileTreeContextMenuItems as buildBaseContextMenuItems } from "../../../components/fileTreeActionRegistry";

type BuildWorkspaceFileTreeContextMenuItemsInput = {
  labels: {
    createFile: string;
    createFolder: string;
    rename: string;
    delete: string;
    deleteMultiple: string;
    copy: string;
    cut: string;
    paste: string;
    copyPath: string;
    copyRelativePath: string;
    openInFileManager: string;
    openInExternalApp: string;
    openInLastUsedExternalApp: string;
  };
  isMultiSelect?: boolean;
  canCreateAtContext: boolean;
  canCreateFile: boolean;
  canCreateFolder: boolean;
  canRenameEntry: boolean;
  canDeleteEntry: boolean;
  canCopyEntry: boolean;
  canCutEntry: boolean;
  canPasteEntries: boolean;
  canCopyPath: boolean;
  canCopyRelativePath: boolean;
  canOpenInFileManager: boolean;
  showOpenInExternalAppMenuItem: boolean;
  showOpenInLastUsedExternalAppMenuItem: boolean;
  contextBasePath: string;
  contextTargetPath: string;
  contextPasteDestination: string;
  lastUsedWorkspaceExternalAppPreset: Pick<ExternalAppPreset, "id" | "iconSrc"> | null;
  handlers: {
    startCreate: (basePath: string, isDirectory: boolean) => void;
    rename: () => void;
    delete: () => Promise<void>;
    copyEntry: () => Promise<void>;
    cutEntry: () => Promise<void>;
    pasteEntries: (destinationPath: string) => Promise<void>;
    copyPath: () => Promise<void>;
    copyRelativePath: () => Promise<void>;
    openInFileManager: () => Promise<void>;
    openInExternalApp: (appId: ExternalAppId) => Promise<void>;
  };
};

/** Builds context menu entries for the file tree, including external app submenus. */
export function buildWorkspaceFileTreeContextMenuItems({
  labels,
  isMultiSelect,
  canCreateAtContext,
  canCreateFile,
  canCreateFolder,
  canRenameEntry,
  canDeleteEntry,
  canCopyEntry,
  canCutEntry,
  canPasteEntries,
  canCopyPath,
  canCopyRelativePath,
  canOpenInFileManager,
  showOpenInExternalAppMenuItem,
  showOpenInLastUsedExternalAppMenuItem,
  contextBasePath,
  contextTargetPath,
  contextPasteDestination,
  lastUsedWorkspaceExternalAppPreset,
  handlers,
}: BuildWorkspaceFileTreeContextMenuItemsInput): ContextMenuEntry[] {
  if (isMultiSelect) {
    const items: ContextMenuEntry[] = [];
    if (canDeleteEntry) {
      items.push({
        id: "delete",
        label: labels.deleteMultiple,
        onSelect: () => {
          void handlers.delete();
        },
      });
    }
    // Copy Path is intentionally excluded from multi-select: the handler would
    // only copy the right-clicked path, not the full selection.
    return items;
  }

  const baseContextMenuItems = buildBaseContextMenuItems(
    {
      labels: {
        createFile: labels.createFile,
        createFolder: labels.createFolder,
        rename: labels.rename,
        delete: labels.delete,
        copy: labels.copy,
        cut: labels.cut,
        paste: labels.paste,
        copyPath: labels.copyPath,
        copyRelativePath: labels.copyRelativePath,
        openInFileManager: labels.openInFileManager,
      },
      canCreateAtContext,
      canCreateFile,
      canCreateFolder,
      canRenameEntry,
      canDeleteEntry,
      canCopyEntry,
      canCutEntry,
      canPasteEntries,
      canCopyPath,
      canCopyRelativePath,
      canOpenInFileManager,
      contextBasePath,
      contextTargetPath,
      contextPasteDestination,
      handlers: {
        startCreateFile: (basePath) => {
          handlers.startCreate(basePath, false);
        },
        startCreateFolder: (basePath) => {
          handlers.startCreate(basePath, true);
        },
        rename: handlers.rename,
        delete: handlers.delete,
        copyEntry: handlers.copyEntry,
        cutEntry: handlers.cutEntry,
        pasteEntries: handlers.pasteEntries,
        copyPath: handlers.copyPath,
        copyRelativePath: handlers.copyRelativePath,
        openInFileManager: handlers.openInFileManager,
      },
    },
    [],
  );

  const externalAppSubmenuItems: ContextMenuEntry[] = EXTERNAL_APP_MENU_ENTRIES.reduce<ContextMenuEntry[]>(
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
            void handlers.openInExternalApp(appPreset.id);
          },
        });
        return items;
      }

      const jetBrainsItems: ContextMenuEntry[] = JETBRAINS_EXTERNAL_APP_IDS.reduce<ContextMenuEntry[]>(
        (childItems, appId) => {
          const appPreset = findExternalAppPreset(appId);
          if (!appPreset) {
            return childItems;
          }

          childItems.push({
            id: appPreset.id,
            label: appPreset.label,
            icon: <Box component="img" src={appPreset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
            onSelect: () => {
              void handlers.openInExternalApp(appPreset.id);
            },
          });

          return childItems;
        },
        [],
      );

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

  return [
    ...baseContextMenuItems.map((item): ContextMenuEntry => {
      if (item.kind === "divider") {
        return {
          kind: "divider",
          id: item.id,
        };
      }

      return {
        id: item.id,
        label: item.label,
        disabled: item.disabled,
        onSelect: item.onSelect,
      };
    }),
    ...(showOpenInExternalAppMenuItem
      ? [
          {
            kind: "divider" as const,
            id: "open-in-external-app-divider",
          },
        ]
      : []),
    ...(showOpenInLastUsedExternalAppMenuItem
      ? [
          {
            id: "open-in-last-used-external-app-menu-item",
            label: labels.openInLastUsedExternalApp,
            endAdornment: (
              <Box
                component="img"
                src={lastUsedWorkspaceExternalAppPreset?.iconSrc ?? ""}
                alt=""
                sx={{ width: 16, height: 16, ml: 1 }}
              />
            ),
            onSelect: () => {
              if (!lastUsedWorkspaceExternalAppPreset) {
                return;
              }

              void handlers.openInExternalApp(lastUsedWorkspaceExternalAppPreset.id);
            },
          },
        ]
      : []),
    ...(showOpenInExternalAppMenuItem
      ? [
          {
            id: "open-in-external-app-menu-item",
            label: labels.openInExternalApp,
            items: externalAppSubmenuItems,
          },
        ]
      : []),
  ];
}
