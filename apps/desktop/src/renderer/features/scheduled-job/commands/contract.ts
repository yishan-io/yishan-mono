/**
 * ScheduledJobCommands — the public command surface for the ScheduledJob feature.
 *
 * Phase 8 contract. Owned by `features/scheduled-job/commands/scheduledJobCommands.ts`;
 * conformance enforces the surface at typecheck time.
 */
import type * as scheduledJobCommands from "./scheduledJobCommands";

export type ScheduledJobCommands = {
  updateScheduledJob: typeof scheduledJobCommands.updateScheduledJob;
  deleteScheduledJob: typeof scheduledJobCommands.deleteScheduledJob;
  createScheduledJob: typeof scheduledJobCommands.createScheduledJob;
  loadScheduledJobs: typeof scheduledJobCommands.loadScheduledJobs;
  pauseScheduledJob: typeof scheduledJobCommands.pauseScheduledJob;
  resumeScheduledJob: typeof scheduledJobCommands.resumeScheduledJob;
  runScheduledJobNow: typeof scheduledJobCommands.runScheduledJobNow;
  listScheduledJobRuns: typeof scheduledJobCommands.listScheduledJobRuns;
};
