import { LuGitPullRequest, LuGitPullRequestClosed } from "react-icons/lu";

export type PullRequestIconState = "open" | "approved" | "closed" | "merged" | "draft" | "review" | string;

/**
 * Returns the display color for a pull request state.
 *
 * Accepts the normalized api-service state ("open" | "closed" | "merged")
 * or the daemon status string ("draft" | "review" | "merged" | "closed" | "open").
 */
export function pullRequestStateColor(state: PullRequestIconState, isDraft?: boolean): string {
  const s = state.toLowerCase();
  if (s === "merged") return "#9333ea";
  if (s === "closed") return "#dc2626";
  if (isDraft || s === "draft") return "#71717a";
  if (s === "approved") return "#0f766e";
  return "#16a34a";
}

type PullRequestIconProps = {
  state: PullRequestIconState;
  isDraft?: boolean;
  size?: number;
};

/**
 * Renders the appropriate pull request icon for a given state with the
 * correct color. Use this wherever a PR status icon is displayed so that
 * the visual language is consistent across the left and right panes.
 *
 * - open / approved / draft / review / merged → LuGitPullRequest
 * - closed (cancelled)             → LuGitPullRequestClosed
 */
export function PullRequestIcon({ state, isDraft, size = 14 }: PullRequestIconProps) {
  const color = pullRequestStateColor(state, isDraft);
  const s = state.toLowerCase();
  const Icon = s === "closed" ? LuGitPullRequestClosed : LuGitPullRequest;
  return <Icon size={size} color={color} />;
}
