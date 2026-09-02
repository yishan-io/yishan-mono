export { TaskClient, buildTaskDescription } from "./client";
export type {
  LocalTask,
  LocalTaskSearchResult,
  TaskAppendNoteInput,
  TaskFinishInput,
  TaskListInput,
  TaskListResult,
  TaskReadInput,
  TaskReadResult,
  TaskSearchInput,
  TaskSearchResult,
  TaskTemplatesResult,
  TaskUpdateInput,
  TaskWriteInput,
} from "./protocol";
export { apply, inject, name } from "./plugin";
