import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { ScheduledJobRecord, ScheduledJobRunRecord } from "../../api/scheduledJobApi";
import { useCommands } from "../../hooks/useCommands";

const RUNS_PANE_MIN_WIDTH = 160;
const RUNS_PANE_DEFAULT_WIDTH = 220;

type UseScheduledJobDetailStateParams = {
  job: ScheduledJobRecord;
  orgId: string;
  onBack: () => void;
};

/** Owns local action and dialog state for the scheduled job detail view. */
export function useScheduledJobDetailState({ job, orgId, onBack }: UseScheduledJobDetailStateParams) {
  const { pauseScheduledJob, resumeScheduledJob, runScheduledJobNow, deleteScheduledJob } = useCommands();
  const queryClient = useQueryClient();
  const [runsPaneWidth, setRunsPaneWidth] = useState(RUNS_PANE_DEFAULT_WIDTH);
  const dragRef = useRef({ startX: 0, startWidth: 0 });
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleResizeStart = useCallback(
    (clientX: number) => {
      dragRef.current = { startX: clientX, startWidth: runsPaneWidth };
    },
    [runsPaneWidth],
  );

  const handleResizeMove = useCallback((clientX: number) => {
    const delta = dragRef.current.startX - clientX;
    setRunsPaneWidth(Math.max(RUNS_PANE_MIN_WIDTH, dragRef.current.startWidth + delta));
  }, []);

  const handlePause = useCallback(() => {
    void pauseScheduledJob(job.id);
  }, [job.id, pauseScheduledJob]);

  const handleResume = useCallback(() => {
    void resumeScheduledJob(job.id);
  }, [job.id, resumeScheduledJob]);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteScheduledJob(job.id);
      onBack();
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  }, [deleteScheduledJob, job.id, onBack]);

  const handleRunNow = useCallback(async () => {
    const run = await runScheduledJobNow(job.id);
    if (!run) {
      return;
    }
    queryClient.setQueryData<ScheduledJobRunRecord[]>(["scheduled-job-runs", orgId, job.id], (previous = []) => {
      if (previous.some((scheduledRun) => scheduledRun.id === run.id)) {
        return previous;
      }
      return [run, ...previous].slice(0, 20);
    });
  }, [job.id, orgId, queryClient, runScheduledJobNow]);

  return {
    runsPaneWidth,
    isEditOpen,
    isDeleteOpen,
    isDeleting,
    setIsEditOpen,
    setIsDeleteOpen,
    handleResizeStart,
    handleResizeMove,
    handlePause,
    handleResume,
    handleConfirmDelete,
    handleRunNow,
  };
}
