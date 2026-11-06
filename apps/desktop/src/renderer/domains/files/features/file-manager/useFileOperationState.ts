import { useCallback, useRef, useState } from "react";
import { createOperationId, getFileOperationErrorMessage } from "./fileTreeEntries";

export type FileOperationState = {
  operationId: string;
  workspaceWorktreePath: string;
  mode: "copy" | "move" | "import";
  status: "running" | "completed" | "failed";
  processed: number;
  total: number;
  currentPath?: string;
};

export type UseFileOperationStateResult = {
  fileOperationState: FileOperationState | null;
  fileOperationError: string | null;
  setFileOperationError: (value: string | null) => void;
  resetFileOperationState: () => void;
  beginFileOperation: (mode: FileOperationState["mode"]) => string;
  completeFileOperation: (operationId: string) => void;
  failFileOperation: (operationId: string, error: unknown) => void;
};

const alwaysCurrent = () => true;

/** Manages file-tree operation progress + failure state. */
export function useFileOperationState(selectedWorkspaceWorktreePath: string | undefined, isCurrentListing = alwaysCurrent): UseFileOperationStateResult {
  const [fileOperationState, setFileOperationState] = useState<FileOperationState | null>(null);
  const [fileOperationError, writeFileOperationError] = useState<string | null>(null);

  const activeOperation = useRef<string | null>(null);
  const setFileOperationError = useCallback((value: string | null) => {
    if (isCurrentListing()) writeFileOperationError(value);
  }, [isCurrentListing]);

  const beginFileOperation = useCallback(
    (mode: FileOperationState["mode"]) => {
      const operationId = createOperationId();
      if (!isCurrentListing()) return operationId;
      activeOperation.current = operationId;
      setFileOperationError(null);
      setFileOperationState({
        operationId,
        workspaceWorktreePath: selectedWorkspaceWorktreePath ?? "",
        mode,
        status: "running",
        processed: 0,
        total: 1,
      });

      return operationId;
    },
    [selectedWorkspaceWorktreePath, isCurrentListing, setFileOperationError],
  );

  const completeFileOperation = useCallback((operationId: string): void => {
    if (!isCurrentListing() || activeOperation.current !== operationId) return;
    setFileOperationState((currentState) => {
      if (!currentState || currentState.operationId !== operationId) {
        return currentState;
      }

      return {
        ...currentState,
        status: "completed",
        processed: 1,
        total: 1,
      };
    });
  }, [isCurrentListing]);

  const failFileOperation = useCallback((operationId: string, error: unknown): void => {
    if (!isCurrentListing() || activeOperation.current !== operationId) return;
    setFileOperationState((currentState) => {
      if (!currentState || currentState.operationId !== operationId) {
        return currentState;
      }

      return {
        ...currentState,
        status: "failed",
      };
    });
    setFileOperationError(getFileOperationErrorMessage(error));
  }, [isCurrentListing, setFileOperationError]);

  const resetFileOperationState = useCallback((): void => {
    activeOperation.current = null;
    setFileOperationState(null);
  }, []);

  return {
    fileOperationState,
    fileOperationError,
    setFileOperationError,
    resetFileOperationState,
    beginFileOperation,
    completeFileOperation,
    failFileOperation,
  };
}
