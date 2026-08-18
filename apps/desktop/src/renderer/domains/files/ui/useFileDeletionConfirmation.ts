import { useCallback, useMemo, useRef, useState } from "react";

type PendingFileDeletion = {
  paths: string[];
  hasDirectory: boolean;
};

type UseFileDeletionConfirmationInput = {
  repoFiles: string[];
  deleteEntry: (path: string) => Promise<void>;
};

export function useFileDeletionConfirmation({ repoFiles, deleteEntry }: UseFileDeletionConfirmationInput) {
  const [pendingFileDeletion, setPendingFileDeletion] = useState<PendingFileDeletion | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [deletionError, setDeletionError] = useState<{ failCount: number; total: number } | null>(null);
  const deleteEntryRef = useRef(deleteEntry);

  deleteEntryRef.current = deleteEntry;

  const handleRequestFileDeletion = useCallback(
    (path: string) => {
      if (!path || isDeletingEntry) {
        return;
      }

      setPendingFileDeletion({
        paths: [path],
        hasDirectory: repoFiles.some((repoPath) => repoPath === `${path}/`),
      });
    },
    [isDeletingEntry, repoFiles],
  );

  const handleRequestMultiFileDeletion = useCallback(
    (paths: string[]) => {
      if (!paths.length || isDeletingEntry) {
        return;
      }

      setPendingFileDeletion({
        paths,
        hasDirectory: paths.some((p) => repoFiles.some((f) => f === `${p}/`)),
      });
    },
    [isDeletingEntry, repoFiles],
  );

  const handleCancelFileDeletion = useCallback(() => {
    if (isDeletingEntry) {
      return;
    }

    setPendingFileDeletion(null);
  }, [isDeletingEntry]);

  const handleConfirmFileDeletion = useCallback(async () => {
    if (!pendingFileDeletion || isDeletingEntry) {
      return;
    }

    const targetPaths = pendingFileDeletion.paths;

    // Close the modal before the full delete workflow finishes so a slow
    // post-delete refresh cannot trap the user in a submitting dialog.
    setPendingFileDeletion(null);
    setIsDeletingEntry(true);

    let failCount = 0;
    for (const p of targetPaths) {
      try {
        await deleteEntryRef.current(p);
      } catch (error) {
        console.error("Failed to delete file tree entry", error);
        failCount++;
      }
    }

    setIsDeletingEntry(false);

    if (failCount > 0) {
      setDeletionError({ failCount, total: targetPaths.length });
    }
  }, [isDeletingEntry, pendingFileDeletion]);

  const clearDeletionError = useCallback(() => {
    setDeletionError(null);
  }, []);

  const pendingFileDeletionDescriptionKey = useMemo(() => {
    if (!pendingFileDeletion) {
      return "files.delete.confirmFile";
    }

    if (pendingFileDeletion.paths.length > 1) {
      return "files.delete.confirmMultiple";
    }

    return pendingFileDeletion.hasDirectory ? "files.delete.confirmDirectory" : "files.delete.confirmFile";
  }, [pendingFileDeletion]);

  return {
    pendingFileDeletion,
    pendingFileDeletionDescriptionKey,
    isDeletingEntry,
    deletionError,
    clearDeletionError,
    handleRequestFileDeletion,
    handleRequestMultiFileDeletion,
    handleCancelFileDeletion,
    handleConfirmFileDeletion,
  };
}
