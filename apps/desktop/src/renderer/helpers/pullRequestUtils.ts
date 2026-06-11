import type { DaemonWorkspacePullRequest } from "../rpc/daemonTypes";

/**
 * Derives one canonical display status string from one live daemon pull-request
 * object, normalising the raw `status` field and draft/complete flags.
 */
export function livePrStatus(pr: DaemonWorkspacePullRequest): string {
  const s = (pr.status ?? "").toLowerCase();
  const reviewDecision = (pr.reviewDecision ?? "").toLowerCase();
  if (pr.complete || s === "merged") return "merged";
  if (pr.isDraft || s === "draft") return "draft";
  if (s === "closed") return "closed";
  if (reviewDecision === "approved") return "approved";
  return "open";
}
