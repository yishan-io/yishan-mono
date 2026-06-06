import { useCallback, useMemo, useRef, useState } from "react";

type PendingFileDeletion = {
  path: string;
  isDirectory: boolean;
};

type UseFileDeletionConfirmationInput = {
  repoFiles: string[];
  deleteEntry: (path: string) => Promise<void>;
};

export function useFileDeletionConfirmation({ repoFiles, deleteEntry }: UseFileDeletionConfirmationInput) {
  const [pendingFileDeletion, setPendingFileDeletion] = useState<PendingFileDeletion | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const deleteEntryRef = useRef(deleteEntry);

  deleteEntryRef.current = deleteEntry;

  const handleRequestFileDeletion = useCallback(
    (path: string) => {
      if (!path) {
        return;
      }

      setPendingFileDeletion({
        path,
        isDirectory: repoFiles.some((repoPath) => repoPath === `${path}/`),
      });
    },
    [repoFiles],
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

    setIsDeletingEntry(true);
    try {
      await deleteEntryRef.current(pendingFileDeletion.path);
      setPendingFileDeletion(null);
    } catch (error) {
      console.error("Failed to delete file tree entry", error);
    } finally {
      setIsDeletingEntry(false);
    }
  }, [isDeletingEntry, pendingFileDeletion]);

  const pendingFileDeletionDescriptionKey = useMemo(() => {
    if (!pendingFileDeletion) {
      return "files.delete.confirmFile";
    }

    return pendingFileDeletion.isDirectory ? "files.delete.confirmDirectory" : "files.delete.confirmFile";
  }, [pendingFileDeletion]);

  return {
    pendingFileDeletion,
    pendingFileDeletionDescriptionKey,
    isDeletingEntry,
    handleRequestFileDeletion,
    handleCancelFileDeletion,
    handleConfirmFileDeletion,
  };
}
