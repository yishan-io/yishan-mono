import { useCallback, useEffect } from "react";
import {
  createLocalTaskTag,
  loadLocalTaskContext,
  loadLocalTaskDetails,
  updateLocalTask,
} from "../../commands/localTaskCommands";
import type { LocalTask, LocalTaskPriority, LocalTaskStatus } from "../../localTaskTypes";
import { localTaskStore } from "../../state/localTaskStore";

/** Detail projection state and commands for a selected Task Hub task. */
export type TaskHubDetailProjection = ReturnType<typeof useTaskHubDetailProjection>;

/** Loads and mutates the selected Task Hub task's detail projection. */
export function useTaskHubDetailProjection(selectedTask: LocalTask | undefined) {
  const tagCatalog = localTaskStore((state) => state.tagCatalog);
  const contextByTaskId = localTaskStore((state) => state.contextByTaskId);
  const contextLoadStateByTaskId = localTaskStore((state) => state.contextLoadStateByTaskId);
  const contextErrorByTaskId = localTaskStore((state) => state.contextErrorByTaskId);
  const detailsByTaskId = localTaskStore((state) => state.detailsByTaskId);
  const detailsLoadStateByTaskId = localTaskStore((state) => state.detailsLoadStateByTaskId);
  const detailsErrorByTaskId = localTaskStore((state) => state.detailsErrorByTaskId);
  const isMutationLoading = localTaskStore((state) => state.isMutationLoading);
  const mutationError = localTaskStore((state) => state.mutationError);

  useEffect(() => {
    if (!selectedTask) return;
    const contextLoadState = contextLoadStateByTaskId[selectedTask.id];
    if (!contextByTaskId[selectedTask.id] && (!contextLoadState || contextLoadState === "idle")) {
      // fire-and-forget: Local Task store owns loading and error state.
      void loadLocalTaskContext(selectedTask.id);
    }
  }, [contextByTaskId, contextLoadStateByTaskId, selectedTask]);

  useEffect(() => {
    const detailsLoadState = selectedTask ? detailsLoadStateByTaskId[selectedTask.id] : undefined;
    if (selectedTask && !detailsByTaskId[selectedTask.id] && (!detailsLoadState || detailsLoadState === "idle")) {
      // fire-and-forget: Local Task store owns loading and error state.
      void loadLocalTaskDetails(selectedTask.id).catch((loadError) =>
        console.error("Failed to load Local Task detail projection", loadError),
      );
    }
  }, [detailsByTaskId, detailsLoadStateByTaskId, selectedTask]);

  const handleRetryContext = useCallback(() => {
    if (!selectedTask) return;
    // fire-and-forget: Local Task store owns loading and error state.
    void loadLocalTaskContext(selectedTask.id);
  }, [selectedTask]);
  const handleRetryDetails = useCallback(() => {
    if (!selectedTask) return;
    // fire-and-forget: Local Task store owns loading and error state.
    void loadLocalTaskDetails(selectedTask.id).catch((loadError) =>
      console.error("Failed to retry Local Task detail projection", loadError),
    );
  }, [selectedTask]);
  const handleDetailStatus = useCallback(
    (status: LocalTaskStatus) => {
      if (!selectedTask) return;
      // fire-and-forget: Local Task store owns loading and error state.
      void updateLocalTask(selectedTask.id, { status }).catch((statusError) =>
        console.error("Failed to update Local Task status", statusError),
      );
    },
    [selectedTask],
  );
  const handleDetailPriority = useCallback(
    (priority: LocalTaskPriority) => {
      if (!selectedTask) return;
      // fire-and-forget: Local Task store owns loading and error state.
      void updateLocalTask(selectedTask.id, { priority }).catch((priorityError) =>
        console.error("Failed to update Local Task priority", priorityError),
      );
    },
    [selectedTask],
  );
  const handleDetailTagIdsChange = useCallback(
    async (tagIds: string[]) => {
      if (selectedTask) await updateLocalTask(selectedTask.id, { tagIds });
    },
    [selectedTask],
  );

  return {
    context: selectedTask ? contextByTaskId[selectedTask.id] : undefined,
    contextLoadState: selectedTask ? (contextLoadStateByTaskId[selectedTask.id] ?? "idle") : "idle",
    contextError: selectedTask ? (contextErrorByTaskId[selectedTask.id] ?? null) : null,
    details: selectedTask ? detailsByTaskId[selectedTask.id] : undefined,
    detailsLoadState: selectedTask ? (detailsLoadStateByTaskId[selectedTask.id] ?? "idle") : "idle",
    detailsError: selectedTask ? (detailsErrorByTaskId[selectedTask.id] ?? null) : null,
    tagCatalog,
    isMutationLoading,
    mutationError,
    handleRetryContext,
    handleRetryDetails,
    handleDetailStatus,
    handleDetailPriority,
    handleDetailTagIdsChange,
    createLocalTaskTag,
  };
}
