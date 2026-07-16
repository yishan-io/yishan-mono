import { copyFiles, renameEntry, writeFileBase64 } from "@renderer/commands/fileCommands";
import type { WorkspaceFileEntry } from "@shared/contracts/rpcRequestTypes";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_CLIPBOARD_SOURCE_RESOLVERS,
  type FileTreeClipboardState,
  resolveClipboardSource,
} from "../clipboardSourceResolvers";
import { mapWorkspaceEntryPaths, resolveExternalClipboardFilePayloads } from "../fileTreeHelpers";
import { type FileTreeMoveUndoEntry, buildMoveUndoEntries, resolvePreferredImportedPath } from "../fileTreePathHelpers";
import {
  captureNativeExternalClipboardSourcePathsSnapshot,
  resolveExternalClipboardSourcePaths,
} from "./fileTreeClipboardResolvers";
import type { FileTreeUndoAction } from "./useFileTreeUndo";

type UseFileTreeClipboardInput = {
  selectedWorkspaceId: string | undefined;
  selectedWorkspaceWorktreePath: string | undefined;
  repoEntries: WorkspaceFileEntry[];
  clipboardState: FileTreeClipboardState | null;
  setClipboardState: React.Dispatch<React.SetStateAction<FileTreeClipboardState | null>>;
  loadAllRepoFiles: () => Promise<string[]>;
  pushUndoAction: (action: FileTreeUndoAction) => void;
  requestFileTreeSelection: (path: string | null, focus?: boolean) => void;
  beginFileOperation: (mode: "copy" | "move" | "import") => string;
  completeFileOperation: (operationId: string) => void;
  failFileOperation: (operationId: string, error: unknown) => void;
  setFileOperationError: (error: string | null) => void;
};

export function useFileTreeClipboard({
  selectedWorkspaceId,
  selectedWorkspaceWorktreePath,
  repoEntries,
  clipboardState,
  setClipboardState,
  loadAllRepoFiles,
  pushUndoAction,
  requestFileTreeSelection,
  beginFileOperation,
  completeFileOperation,
  failFileOperation,
  setFileOperationError,
}: UseFileTreeClipboardInput) {
  const { t } = useTranslation();
  const isExternalImportInFlightRef = useRef(false);
  const clipboardStateRequestIdRef = useRef(0);

  const beginExternalImportLock = useCallback((): boolean => {
    if (isExternalImportInFlightRef.current) {
      return false;
    }

    isExternalImportInFlightRef.current = true;
    return true;
  }, []);

  const endExternalImportLock = useCallback((): void => {
    isExternalImportInFlightRef.current = false;
  }, []);

  const setInternalClipboardState = useCallback(
    (mode: "copy" | "move", path: string): void => {
      clipboardStateRequestIdRef.current += 1;
      const requestId = clipboardStateRequestIdRef.current;
      setClipboardState({
        requestId,
        mode,
        sourcePaths: [path],
        externalClipboardSnapshotSourcePaths: null,
      });

      void (async () => {
        const externalClipboardSnapshotSourcePaths = await captureNativeExternalClipboardSourcePathsSnapshot();
        setClipboardState((currentState) => {
          if (!currentState || currentState.requestId !== requestId) {
            return currentState;
          }

          return {
            ...currentState,
            externalClipboardSnapshotSourcePaths,
          };
        });
      })();
    },
    [setClipboardState],
  );

  const onPasteEntries = useCallback(
    async (destinationPath: string) => {
      if (!selectedWorkspaceWorktreePath || !selectedWorkspaceId) {
        return;
      }

      const repoFilesBeforePaste = mapWorkspaceEntryPaths(repoEntries);
      const skipExternalPathRead = clipboardState?.mode === "move";
      const externalClipboardSourcePathResult = skipExternalPathRead
        ? { sourcePaths: [], nativeOutcome: null }
        : await resolveExternalClipboardSourcePaths();
      const { nativeOutcome } = externalClipboardSourcePathResult;
      const externalSourcePaths = externalClipboardSourcePathResult.sourcePaths;
      const externalFilePayloads =
        skipExternalPathRead || externalSourcePaths.length > 0 ? [] : await resolveExternalClipboardFilePayloads();

      const shouldSetExternalClipboardError =
        !skipExternalPathRead &&
        !clipboardState &&
        externalSourcePaths.length === 0 &&
        externalFilePayloads.length === 0 &&
        nativeOutcome &&
        (nativeOutcome.kind === "permission-denied" || nativeOutcome.kind === "parse-failed");

      if (shouldSetExternalClipboardError && nativeOutcome) {
        setFileOperationError(
          nativeOutcome.kind === "permission-denied" ? t("files.operations.failed") : nativeOutcome.message,
        );
      }

      const resolvedClipboardSource = resolveClipboardSource(
        {
          clipboardState,
          externalSourcePaths,
          externalFilePayloads,
        },
        DEFAULT_CLIPBOARD_SOURCE_RESOLVERS,
      );

      if (!resolvedClipboardSource) {
        return;
      }

      if (resolvedClipboardSource.kind === "external-paths") {
        if (!beginExternalImportLock()) {
          return;
        }

        const operationId = beginFileOperation("import");

        try {
          const destinationDirectory = destinationPath
            ? `${selectedWorkspaceWorktreePath}/${destinationPath}`
            : selectedWorkspaceWorktreePath;

          const result = await copyFiles({
            sourcePaths: resolvedClipboardSource.sourcePaths,
            destinationDirectory,
          });
          if (!result.ok) {
            throw new Error(result.error);
          }

          completeFileOperation(operationId);

          await loadAllRepoFiles();
          const nextRepoFiles = await loadAllRepoFiles();
          requestFileTreeSelection(
            resolvePreferredImportedPath(
              repoFilesBeforePaste,
              nextRepoFiles,
              destinationPath,
              resolvedClipboardSource.sourcePaths,
            ),
          );
        } catch (error) {
          failFileOperation(operationId, error);
          console.error("Failed to import pasted external workspace entries", error);
        } finally {
          endExternalImportLock();
        }
        return;
      }

      if (resolvedClipboardSource.kind === "external-file-payloads") {
        if (!beginExternalImportLock()) {
          return;
        }

        const operationId = beginFileOperation("import");

        try {
          // Write each base64-encoded payload using the host bridge
          for (const filePayload of resolvedClipboardSource.filePayloads) {
            const relPath = destinationPath
              ? `${destinationPath}/${filePayload.relativePath}`
              : filePayload.relativePath;
            const absolutePath = `${selectedWorkspaceWorktreePath}/${relPath}`;
            const result = await writeFileBase64({
              absolutePath,
              contentBase64: filePayload.contentBase64,
            });
            if (!result.ok) {
              throw new Error(result.error);
            }
          }

          completeFileOperation(operationId);

          await loadAllRepoFiles();
          const nextRepoFiles = await loadAllRepoFiles();
          requestFileTreeSelection(
            resolvePreferredImportedPath(
              repoFilesBeforePaste,
              nextRepoFiles,
              destinationPath,
              resolvedClipboardSource.filePayloads.map((filePayload) => filePayload.relativePath),
            ),
          );
        } catch (error) {
          failFileOperation(operationId, error);
          console.error("Failed to import pasted external workspace file payloads", error);
        } finally {
          endExternalImportLock();
        }
        return;
      }

      const moveUndoEntries =
        resolvedClipboardSource.mode === "move"
          ? buildMoveUndoEntries(repoFilesBeforePaste, resolvedClipboardSource.sourcePaths, destinationPath)
          : [];
      const operationId = beginFileOperation(resolvedClipboardSource.mode);

      try {
        if (resolvedClipboardSource.mode === "move") {
          // Move each source entry using the file.move RPC method
          for (const sourcePath of resolvedClipboardSource.sourcePaths) {
            const fileName = sourcePath.split("/").filter(Boolean).at(-1);
            if (!fileName) {
              continue;
            }

            const toRelativePath = destinationPath ? `${destinationPath}/${fileName}` : fileName;
            await renameEntry({
              workspaceId: selectedWorkspaceId,
              fromRelativePath: sourcePath,
              toRelativePath,
            });
          }
        } else {
          // Copy each source entry using the Electron host bridge
          const absoluteSourcePaths = resolvedClipboardSource.sourcePaths.map(
            (srcPath) => `${selectedWorkspaceWorktreePath}/${srcPath}`,
          );
          const destinationDirectory = destinationPath
            ? `${selectedWorkspaceWorktreePath}/${destinationPath}`
            : selectedWorkspaceWorktreePath;

          const result = await copyFiles({
            sourcePaths: absoluteSourcePaths,
            destinationDirectory,
          });
          if (!result.ok) {
            throw new Error(result.error);
          }
        }

        completeFileOperation(operationId);

        await loadAllRepoFiles();
        const nextRepoFiles = await loadAllRepoFiles();
        requestFileTreeSelection(
          resolvePreferredImportedPath(
            repoFilesBeforePaste,
            nextRepoFiles,
            destinationPath,
            resolvedClipboardSource.sourcePaths,
          ),
        );

        if (resolvedClipboardSource.mode === "move") {
          if (moveUndoEntries.length > 0) {
            pushUndoAction({
              kind: "move",
              entries: moveUndoEntries,
            });
          }
          setClipboardState(null);
        }
      } catch (error) {
        failFileOperation(operationId, error);
        console.error("Failed to paste workspace entries", error);
      }
    },
    [
      beginExternalImportLock,
      beginFileOperation,
      clipboardState,
      completeFileOperation,
      endExternalImportLock,
      failFileOperation,
      loadAllRepoFiles,
      pushUndoAction,
      repoEntries,
      requestFileTreeSelection,
      selectedWorkspaceId,
      selectedWorkspaceWorktreePath,
      setClipboardState,
      setFileOperationError,
      t,
    ],
  );

  const onDropExternalEntries = useCallback(
    async (sourcePaths: string[], destinationPath: string) => {
      if (!selectedWorkspaceWorktreePath) {
        console.warn("[FileTree drop] No workspace worktree path available");
        return;
      }

      console.info("[FileTree drop] External file drop:", {
        sourcePaths,
        destinationPath,
        selectedWorkspaceWorktreePath,
      });

      const repoFilesBeforeDropImport = mapWorkspaceEntryPaths(repoEntries);
      if (!beginExternalImportLock()) {
        console.warn("[FileTree drop] External import already in flight");
        return;
      }

      const operationId = beginFileOperation("import");

      try {
        // Compute absolute destination directory path
        const destinationDirectory = destinationPath
          ? `${selectedWorkspaceWorktreePath}/${destinationPath}`
          : selectedWorkspaceWorktreePath;

        console.info("[FileTree drop] Copying files:", {
          sourcePaths,
          destinationDirectory,
        });

        // Copy files using the Electron host bridge (Node.js fs)
        const result = await copyFiles({ sourcePaths, destinationDirectory });
        if (!result.ok) {
          throw new Error(result.error);
        }

        console.info("[FileTree drop] Copy succeeded:", result);
        completeFileOperation(operationId);

        await loadAllRepoFiles();
        const nextRepoFiles = await loadAllRepoFiles();
        requestFileTreeSelection(
          resolvePreferredImportedPath(repoFilesBeforeDropImport, nextRepoFiles, destinationPath, sourcePaths),
        );
      } catch (error) {
        failFileOperation(operationId, error);
        console.error("Failed to import dropped workspace entries", error);
      } finally {
        endExternalImportLock();
      }
    },
    [
      beginExternalImportLock,
      beginFileOperation,
      completeFileOperation,
      endExternalImportLock,
      failFileOperation,
      loadAllRepoFiles,
      repoEntries,
      requestFileTreeSelection,
      selectedWorkspaceWorktreePath,
    ],
  );

  const onMoveEntries = useCallback(
    async (sourceRelativePaths: string[], destinationPath: string) => {
      if (!selectedWorkspaceWorktreePath || !selectedWorkspaceId) {
        return;
      }

      const repoFilesBeforeMove = mapWorkspaceEntryPaths(repoEntries);
      const moveUndoEntries = buildMoveUndoEntries(repoFilesBeforeMove, sourceRelativePaths, destinationPath);
      const operationId = beginFileOperation("move");

      try {
        // Move each source entry using the file.move RPC method (renameEntry).
        // Compute the destination as destinationDir/filename for each source.
        for (const sourcePath of sourceRelativePaths) {
          const fileName = sourcePath.split("/").filter(Boolean).at(-1);
          if (!fileName) {
            continue;
          }

          const toRelativePath = destinationPath ? `${destinationPath}/${fileName}` : fileName;
          await renameEntry({
            workspaceId: selectedWorkspaceId,
            fromRelativePath: sourcePath,
            toRelativePath,
          });
        }

        completeFileOperation(operationId);

        await loadAllRepoFiles();
        const nextRepoFiles = await loadAllRepoFiles();
        requestFileTreeSelection(
          resolvePreferredImportedPath(repoFilesBeforeMove, nextRepoFiles, destinationPath, sourceRelativePaths),
        );

        if (moveUndoEntries.length > 0) {
          pushUndoAction({
            kind: "move",
            entries: moveUndoEntries,
          });
        }
      } catch (error) {
        failFileOperation(operationId, error);
        console.error("Failed to move workspace entries via drag-and-drop", error);
      }
    },
    [
      beginFileOperation,
      completeFileOperation,
      failFileOperation,
      loadAllRepoFiles,
      pushUndoAction,
      repoEntries,
      requestFileTreeSelection,
      selectedWorkspaceId,
      selectedWorkspaceWorktreePath,
    ],
  );

  return {
    setInternalClipboardState,
    onPasteEntries,
    onDropExternalEntries,
    onMoveEntries,
  };
}
