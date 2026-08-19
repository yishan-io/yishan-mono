/**
 * naming module — internal module API (desktop9).
 */
export type { GitBranchPrefixMode } from "./branchPrefix";
export {
  DEFAULT_GIT_BRANCH_PREFIX_MODE,
  normalizeGitBranchPrefixSegment,
  resolveGitBranchPrefix,
} from "./branchPrefix";
export {
  LOCAL_WORKSPACE_DISPLAY_NAME,
  resolveHydratedWorkspaceDisplayMetadata,
  resolveExplicitWorkspaceDisplayMetadata,
  resolveWorkspaceListDisplayName,
} from "./workspaceDisplayNames";
