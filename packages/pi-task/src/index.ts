export { createPiTaskExtension } from "./extension";
export { LocalTaskRpcClient, LocalTaskRPCError, validateLocalTaskDaemonURL } from "./backend/localTaskRpcClient";
export type {
  CreateLocalTaskInput,
  LocalTask,
  LocalTaskContextDetails,
  LocalTaskFilters,
  LocalTaskPriority,
  LocalTaskSearchResult,
  LocalTaskStatus,
  LocalTaskTagRef,
  LocalTaskWorkspaceLink,
  UpdateLocalTaskInput,
} from "./backend/localTaskTypes";

export {
  buildDescription,
  createLocalTaskOperations,
  getProjectIdFromEnvironment,
  LocalTaskOperations,
} from "./tools/taskOperations";
export type {
  LocalTaskMetadataClient,
  SearchTasksInput,
  StartTaskInput,
  TaskListInput,
  UpdateTaskInput,
} from "./tools/taskOperations";

export { createLocalTaskDocuments, LocalTaskDocuments, validateContextDocumentPath } from "./tools/taskDocuments";
export type { LocalTaskDocumentBackend, TaskContextDocument, TaskDocumentOptions } from "./tools/taskDocuments";
