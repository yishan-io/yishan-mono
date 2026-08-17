import type * as gitCommands from "./gitCommands";

/**
 * GitCommands — the public command surface for the Git feature (Phase 12,
 * desktop5.md). Declared by the owning module; `contracts/conformance.ts`
 * enforces the contract at typecheck time.
 */
export type GitCommands = {
  readDiff: typeof gitCommands.readDiff;
  readCommitDiff: typeof gitCommands.readCommitDiff;
  readBranchComparisonDiff: typeof gitCommands.readBranchComparisonDiff;
  listGitChanges: typeof gitCommands.listGitChanges;
  trackGitChanges: typeof gitCommands.trackGitChanges;
  unstageGitChanges: typeof gitCommands.unstageGitChanges;
  revertGitChanges: typeof gitCommands.revertGitChanges;
  commitGitChanges: typeof gitCommands.commitGitChanges;
  getGitBranchStatus: typeof gitCommands.getGitBranchStatus;
  listGitCommitsToTarget: typeof gitCommands.listGitCommitsToTarget;
  inspectGitRepository: typeof gitCommands.inspectGitRepository;
  listGitBranches: typeof gitCommands.listGitBranches;
  pushGitBranch: typeof gitCommands.pushGitBranch;
  publishGitBranch: typeof gitCommands.publishGitBranch;
  getGitAuthorName: typeof gitCommands.getGitAuthorName;
  mergePullRequest: typeof gitCommands.mergePullRequest;
  closePullRequest: typeof gitCommands.closePullRequest;
};
