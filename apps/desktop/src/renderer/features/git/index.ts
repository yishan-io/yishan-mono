/**
 * Git feature public API (Phase 12, desktop5.md).
 */
export type { GitCommands } from "./commands/contract";

// Stable UI entry points for cross-feature composition (Phase 18).
export { ChangesTabView } from "./ui/ChangesTabView";
export { PullRequestTabView } from "./ui/PullRequestTabView";
export { useWorkspacePullRequestState } from "./ui/useWorkspacePullRequestState";
