import { Alert, Box } from "@mui/material";
import type { LocalTask } from "../../localTaskTypes";
import { WorkspaceTaskDetails } from "../workspace-tasks/WorkspaceTaskDetails";
import type { TaskHubDetailProjection } from "./useTaskHubDetailProjection";

type TaskHubTaskDetailsProps = {
  task: LocalTask;
  detailProjection: TaskHubDetailProjection;
};

/** Renders the Task Hub detail projection and its mutation feedback. */
export function TaskHubTaskDetails({ task, detailProjection }: TaskHubTaskDetailsProps) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
      {detailProjection.mutationError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {detailProjection.mutationError}
        </Alert>
      ) : null}
      <WorkspaceTaskDetails
        task={task}
        context={detailProjection.context}
        contextLoadState={detailProjection.contextLoadState}
        contextError={detailProjection.contextError}
        details={detailProjection.details}
        detailsLoadState={detailProjection.detailsLoadState}
        detailsError={detailProjection.detailsError}
        onRetryDetails={detailProjection.handleRetryDetails}
        isMutationLoading={detailProjection.isMutationLoading}
        onStatusChange={detailProjection.handleDetailStatus}
        onPriorityChange={detailProjection.handleDetailPriority}
        onTagIdsChange={detailProjection.handleDetailTagIdsChange}
        onCreateTag={detailProjection.createLocalTaskTag}
        tagCatalog={detailProjection.tagCatalog}
      />
    </Box>
  );
}
