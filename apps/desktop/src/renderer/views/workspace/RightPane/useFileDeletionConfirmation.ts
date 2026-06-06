import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

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

  const deleteEntryMutation = useMutation({
    mutationFn: async (path: string) => {
      await deleteEntry(path);
    },
    onSuccess: () => {
      setPendingFileDeletion(null);
    },
    onError: (error) => {
      console.error("Failed to delete file tree entry", error);
    },
  });

  const isDeletingEntry = deleteEntryMutation.isPending;

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

  const handleConfirmFileDeletion = useCallback(() => {
    if (!pendingFileDeletion) {
      return;
    }

    deleteEntryMutation.mutate(pendingFileDeletion.path);
  }, [deleteEntryMutation, pendingFileDeletion]);

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
