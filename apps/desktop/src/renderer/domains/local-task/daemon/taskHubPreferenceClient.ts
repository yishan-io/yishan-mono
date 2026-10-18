import { preferencesClient } from "@renderer/rpc";
import { asRecord } from "@shared/validation/primitiveReaders";
import type { LocalTaskFilters, LocalTaskStatus } from "../localTaskTypes";

const FILTER_KEY = "task.filter";

/** Validated daemon preference, including the distinction between absent and saved defaults. */
export interface TaskHubFilterPreference {
  isInitialized: boolean;
  filters: LocalTaskFilters;
}

function parsePreference(payload: unknown): TaskHubFilterPreference {
  const preference = asRecord(payload);
  const fields = asRecord(preference?.filters);
  if (!preference || typeof preference.isInitialized !== "boolean" || !fields) {
    throw new TypeError("Invalid Task Hub filter preference");
  }
  const filters: LocalTaskFilters = {};
  for (const field of ["projectId", "workspaceId"] as const) {
    const content = fields[field];
    if (content === undefined) continue;
    if (typeof content !== "string") throw new TypeError(`Invalid Task Hub ${field} filter`);
    filters[field] = content;
  }
  for (const field of ["tags", "tagIds"] as const) {
    const content = fields[field];
    if (content === undefined) continue;
    if (!Array.isArray(content) || !content.every((entry): entry is string => typeof entry === "string")) {
      throw new TypeError(`Invalid Task Hub ${field} filter`);
    }
    filters[field] = content;
  }
  if (fields.status !== undefined) {
    if (
      !Array.isArray(fields.status) ||
      !fields.status.every(
        (status): status is LocalTaskStatus =>
          status === "new" || status === "progressing" || status === "done" || status === "cancelled",
      )
    ) {
      throw new TypeError("Invalid Task Hub status filter");
    }
    filters.status = fields.status;
  }
  if (fields.priority !== undefined) {
    const priority = fields.priority;
    if (priority !== "low" && priority !== "medium" && priority !== "high") {
      throw new TypeError("Invalid Task Hub priority filter");
    }
    filters.priority = priority;
  }
  return { isInitialized: preference.isInitialized, filters };
}

/** Task Hub's concrete preference boundary over the existing local preference RPC. */
export const taskHubPreferenceClient = {
  async load(organizationId: string): Promise<TaskHubFilterPreference> {
    const response = await preferencesClient.get(organizationId, FILTER_KEY);
    return response.found ? parsePreference(response.value) : { isInitialized: false, filters: {} };
  },
  async save(organizationId: string, filters: LocalTaskFilters): Promise<TaskHubFilterPreference> {
    const validatedFilters = parsePreference({ isInitialized: true, filters }).filters;
    const response = await preferencesClient.set(organizationId, FILTER_KEY, {
      isInitialized: true,
      filters: validatedFilters,
    });
    const preference = parsePreference(response.value);
    if (!preference.isInitialized) throw new TypeError("Task Hub filter write was not acknowledged");
    return preference;
  },
};
