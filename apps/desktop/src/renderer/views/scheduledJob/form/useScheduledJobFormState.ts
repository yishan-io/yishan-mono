import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../../../api";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import {
  type ScheduleType,
  type ScheduledJobFormDraft,
  computeNextRunEstimate,
  describeCronExpression,
  toCronExpression,
} from "../scheduledJobFormHelpers";

type ScheduledJobFormProject = {
  id: string;
};

type ScheduledJobFormNode = {
  id: string;
  name: string;
  scope: "private" | "shared";
  canUse: boolean;
};

/** Shared scheduled-job form state that can be restored or reused by wrapper views. */
export type ScheduledJobFormStateSnapshot = {
  draft: ScheduledJobFormDraft;
  scheduleType: ScheduleType;
  scheduleTime: string;
  weeklyDay: string;
};

/** Input for the shared scheduled-job form-state hook. */
export type UseScheduledJobFormStateInput = {
  initialState: ScheduledJobFormStateSnapshot;
  orgId?: string | null;
  projects: ScheduledJobFormProject[];
  daemonId?: string;
};

/** Shared scheduled-job form state and derived schedule preview values. */
export type UseScheduledJobFormStateResult = {
  draft: ScheduledJobFormDraft;
  setDraft: Dispatch<SetStateAction<ScheduledJobFormDraft>>;
  scheduleType: ScheduleType;
  setScheduleType: Dispatch<SetStateAction<ScheduleType>>;
  scheduleTime: string;
  setScheduleTime: Dispatch<SetStateAction<string>>;
  weeklyDay: string;
  setWeeklyDay: Dispatch<SetStateAction<string>>;
  nodes: ScheduledJobFormNode[];
  isNodesLoading: boolean;
  nodesError: string | null;
  cronDescription: string;
  nextRunEstimate: Date | null;
  resetForm: (nextState: ScheduledJobFormStateSnapshot) => void;
};

/** Reuses scheduled-job draft and schedule state across create/edit wrappers. */
export function useScheduledJobFormState({
  initialState,
  orgId,
  projects,
  daemonId,
}: UseScheduledJobFormStateInput): UseScheduledJobFormStateResult {
  const [draft, setDraft] = useState(initialState.draft);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initialState.scheduleType);
  const [weeklyDay, setWeeklyDay] = useState(initialState.weeklyDay);
  const [scheduleTime, setScheduleTime] = useState(initialState.scheduleTime);

  const nodesQuery = useQuery({
    queryKey: ["org-nodes", orgId],
    queryFn: () => api.node.listByOrg(orgId as string),
    enabled: Boolean(orgId),
  });
  const nodes = nodesQuery.data ?? [];
  const nodesError = nodesQuery.isError ? getErrorMessage(nodesQuery.error) : null;

  const resetForm = useCallback((nextState: ScheduledJobFormStateSnapshot) => {
    setDraft(nextState.draft);
    setScheduleType(nextState.scheduleType);
    setWeeklyDay(nextState.weeklyDay);
    setScheduleTime(nextState.scheduleTime);
  }, []);

  useEffect(() => {
    if (draft.projectId || projects.length === 0) {
      return;
    }
    setDraft((previousDraft) => ({
      ...previousDraft,
      projectId: projects[0]?.id ?? "",
    }));
  }, [draft.projectId, projects]);

  useEffect(() => {
    if (!daemonId) {
      return;
    }
    setDraft((previousDraft) => {
      if (previousDraft.nodeId) {
        return previousDraft;
      }
      const daemonNode = nodes.find((node) => node.id === daemonId && node.scope === "private" && node.canUse);
      return daemonNode ? { ...previousDraft, nodeId: daemonNode.id } : previousDraft;
    });
  }, [daemonId, nodes]);

  useEffect(() => {
    if (scheduleType === "custom") {
      return;
    }
    setDraft((previousDraft) => ({
      ...previousDraft,
      cronExpression: toCronExpression(scheduleType, scheduleTime, weeklyDay),
    }));
  }, [scheduleTime, scheduleType, weeklyDay]);

  const nextRunEstimate = useMemo(() => {
    try {
      return computeNextRunEstimate(draft.cronExpression, draft.timezone || "UTC");
    } catch {
      return null;
    }
  }, [draft.cronExpression, draft.timezone]);

  const cronDescription = useMemo(() => describeCronExpression(draft.cronExpression), [draft.cronExpression]);

  return {
    draft,
    setDraft,
    scheduleType,
    setScheduleType,
    scheduleTime,
    setScheduleTime,
    weeklyDay,
    setWeeklyDay,
    nodes,
    isNodesLoading: nodesQuery.isLoading,
    nodesError,
    cronDescription,
    nextRunEstimate,
    resetForm,
  };
}
