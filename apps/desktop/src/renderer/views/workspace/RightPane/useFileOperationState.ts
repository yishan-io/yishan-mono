import { useCallback, useState } from "react";
import { createOperationId, getFileOperationErrorMessage } from "./fileTreeHelpers";

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
  beginFileOperation: (mode: FileOperationState["mode"]) => string;
  completeFileOperation: (operationId: string) => void;
  failFileOperation: (operationId: string, error: unknown) => void;
};

/** Manages file-tree operation progress + failure state. */
export function useFileOperationState(selectedWorkspaceWorktreePath: string | undefined): UseFileOperationStateResult {
  const [fileOperationState, setFileOperationState] = useState<FileOperationState | null>(null);
  const [fileOperationError, setFileOperationError] = useState<string | null>(null);

  const beginFileOperation = useCallback(
    (mode: FileOperationState["mode"]) => {
      const operationId = createOperationId();
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
    [selectedWorkspaceWorktreePath],
  );

  const completeFileOperation = useCallback((operationId: string): void => {
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
  }, []);

  const failFileOperation = useCallback((operationId: string, error: unknown): void => {
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
  }, []);

  return {
    fileOperationState,
    fileOperationError,
    setFileOperationError,
    beginFileOperation,
    completeFileOperation,
    failFileOperation,
  };
}
