import { useEffect, useState } from "react";

type UseFileTreeSignalHandlersInput = {
  selectedEntryPath: string;
  deleteSelectionRequestId: number;
  undoRequestId: number;
  canUndoLastEntryOperation?: boolean;
  handleRequestFileDeletion: (path: string) => void;
  onUndoLastEntryOperation?: () => void | Promise<void>;
};

/**
 * Responds to workspace-level keyboard signals (Delete, Undo) by delegating
 * to the appropriate file-tree operation. Each signal is identified by a
 * monotonically-increasing request ID so that re-renders do not re-trigger.
 */
export function useFileTreeSignalHandlers({
  selectedEntryPath,
  deleteSelectionRequestId,
  undoRequestId,
  canUndoLastEntryOperation,
  handleRequestFileDeletion,
  onUndoLastEntryOperation,
}: UseFileTreeSignalHandlersInput) {
  const [lastHandledDeleteSelectionRequestId, setLastHandledDeleteSelectionRequestId] = useState(0);
  const [lastHandledUndoRequestId, setLastHandledUndoRequestId] = useState(0);

  useEffect(() => {
    if (deleteSelectionRequestId <= lastHandledDeleteSelectionRequestId) {
      return;
    }

    setLastHandledDeleteSelectionRequestId(deleteSelectionRequestId);
    if (!selectedEntryPath) {
      return;
    }

    handleRequestFileDeletion(selectedEntryPath);
  }, [deleteSelectionRequestId, handleRequestFileDeletion, lastHandledDeleteSelectionRequestId, selectedEntryPath]);

  useEffect(() => {
    if (undoRequestId <= lastHandledUndoRequestId) {
      return;
    }

    setLastHandledUndoRequestId(undoRequestId);
    if (!canUndoLastEntryOperation) {
      return;
    }

    void onUndoLastEntryOperation?.();
  }, [canUndoLastEntryOperation, lastHandledUndoRequestId, onUndoLastEntryOperation, undoRequestId]);
}
