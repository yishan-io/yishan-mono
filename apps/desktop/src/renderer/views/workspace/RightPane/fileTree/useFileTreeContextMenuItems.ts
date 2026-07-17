import { resolveDestinationDirectoryPath } from "@renderer/components/FileTree/treeUtils";
import type { FileTreeContextMenuRequest } from "@renderer/components/FileTree/types";
import type { ExternalAppId } from "@shared/contracts/externalApps";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { buildWorkspaceFileTreeContextMenuItems } from "../buildWorkspaceFileTreeContextMenuItems";

type ExternalAppPresetLike = {
  id: ExternalAppId;
  label: string;
  iconSrc: string;
};

type UseFileTreeContextMenuItemsInput = {
  t: TFunction;
  rendererPlatform: string;
  contextMenu: FileTreeContextMenuRequest | null;
  closeContextMenu: () => void;
  canOpenInExternalApp: boolean;
  lastUsedWorkspaceExternalAppPreset: ExternalAppPresetLike | null;
  canPasteEntries: boolean;
  handlers: {
    onCreateFile?: (path: string) => Promise<void>;
    onCreateFolder?: (path: string) => Promise<void>;
    onRenameEntry?: (fromPath: string, toPath: string) => Promise<void>;
    onDeleteEntry?: (path: string) => Promise<void>;
    onCopyPath?: (path: string) => Promise<void>;
    onCopyRelativePath?: (path: string) => Promise<void>;
    onOpenInFileManager?: (path: string) => Promise<void>;
    onOpenInExternalApp?: (input: {
      path?: string;
      appId: ExternalAppId;
    }) => Promise<void>;
    onCopyEntry?: (path: string) => Promise<void>;
    onCutEntry?: (path: string) => Promise<void>;
    onPasteEntries?: (destinationPath: string) => Promise<void>;
  };
};

export function useFileTreeContextMenuItems({
  t,
  rendererPlatform,
  contextMenu,
  closeContextMenu,
  canOpenInExternalApp,
  lastUsedWorkspaceExternalAppPreset,
  canPasteEntries,
  handlers,
}: UseFileTreeContextMenuItemsInput) {
  const contextPasteDestination = resolveDestinationDirectoryPath(
    contextMenu?.targetPath ?? "",
    Boolean(contextMenu?.targetIsDirectory),
  );
  const showOpenInExternalAppMenuItem = Boolean(canOpenInExternalApp && contextMenu?.targetPath);
  const showOpenInLastUsedExternalAppMenuItem = Boolean(
    showOpenInExternalAppMenuItem && lastUsedWorkspaceExternalAppPreset,
  );

  const items = useMemo(
    () =>
      buildWorkspaceFileTreeContextMenuItems({
        labels: {
          createFile: t("files.actions.createFile"),
          createFolder: t("files.actions.createFolder"),
          rename: t("files.actions.rename"),
          delete: t("files.actions.delete"),
          copy: t("files.actions.copy"),
          cut: t("files.actions.cut"),
          paste: t("files.actions.paste"),
          copyPath: t("files.actions.copyPath"),
          copyRelativePath: t("files.actions.copyRelativePath"),
          openInFileManager:
            rendererPlatform === "win32" ? t("files.actions.openInExplorer") : t("files.actions.openInFinder"),
          openInExternalApp: t("files.actions.openInExternalApp"),
          openInLastUsedExternalApp: lastUsedWorkspaceExternalAppPreset
            ? t("files.actions.openInExternalAppQuick", {
                app: lastUsedWorkspaceExternalAppPreset.label,
              })
            : "",
        },
        canCreateAtContext: !contextMenu?.targetPath || Boolean(contextMenu.targetIsDirectory),
        canCreateFile: Boolean(handlers.onCreateFile),
        canCreateFolder: Boolean(handlers.onCreateFolder),
        canRenameEntry: Boolean(handlers.onRenameEntry),
        canDeleteEntry: Boolean(handlers.onDeleteEntry),
        canCopyEntry: Boolean(handlers.onCopyEntry),
        canCutEntry: Boolean(handlers.onCutEntry),
        canPasteEntries: Boolean(canPasteEntries),
        canCopyPath: Boolean(handlers.onCopyPath),
        canCopyRelativePath: Boolean(handlers.onCopyRelativePath),
        canOpenInFileManager: Boolean(handlers.onOpenInFileManager),
        showOpenInExternalAppMenuItem,
        showOpenInLastUsedExternalAppMenuItem,
        contextBasePath: contextMenu?.basePath ?? "",
        contextTargetPath: contextMenu?.targetPath ?? "",
        contextPasteDestination,
        lastUsedWorkspaceExternalAppPreset,
        handlers: {
          startCreate: (_basePath, isDirectory) => {
            if (!contextMenu) {
              return;
            }
            if (isDirectory) {
              contextMenu.startCreateFolder();
              closeContextMenu();
              return;
            }
            contextMenu.startCreateFile();
            closeContextMenu();
          },
          rename: () => {
            contextMenu?.startRename?.();
            closeContextMenu();
          },
          delete: async () => {
            if (!handlers.onDeleteEntry || !contextMenu?.targetPath) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onDeleteEntry(contextMenu.targetPath);
          },
          copyEntry: async () => {
            if (!handlers.onCopyEntry || !contextMenu?.targetPath) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onCopyEntry(contextMenu.targetPath);
          },
          cutEntry: async () => {
            if (!handlers.onCutEntry || !contextMenu?.targetPath) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onCutEntry(contextMenu.targetPath);
          },
          pasteEntries: async (destinationPath: string) => {
            if (!handlers.onPasteEntries || !canPasteEntries) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onPasteEntries(destinationPath);
          },
          copyPath: async () => {
            if (!handlers.onCopyPath || !contextMenu?.targetPath) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onCopyPath(contextMenu.targetPath);
          },
          copyRelativePath: async () => {
            if (!handlers.onCopyRelativePath || !contextMenu?.targetPath) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onCopyRelativePath(contextMenu.targetPath);
          },
          openInFileManager: async () => {
            if (!handlers.onOpenInFileManager || !contextMenu?.targetPath) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onOpenInFileManager(contextMenu.targetPath);
          },
          openInExternalApp: async (appId: ExternalAppId) => {
            if (!handlers.onOpenInExternalApp) {
              closeContextMenu();
              return;
            }
            closeContextMenu();
            await handlers.onOpenInExternalApp({
              appId,
              path: contextMenu?.targetPath || undefined,
            });
          },
        },
      }),
    [
      canPasteEntries,
      closeContextMenu,
      contextMenu,
      contextPasteDestination,
      handlers,
      lastUsedWorkspaceExternalAppPreset,
      rendererPlatform,
      showOpenInExternalAppMenuItem,
      showOpenInLastUsedExternalAppMenuItem,
      t,
    ],
  );

  const anchorPosition =
    contextMenu && typeof contextMenu.mouseX === "number" && typeof contextMenu.mouseY === "number"
      ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
      : undefined;

  return {
    items,
    anchorPosition,
  };
}
