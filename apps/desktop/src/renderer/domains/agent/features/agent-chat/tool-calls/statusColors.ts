/** Returns the badge color used for Agent tool statuses. */
export function getAgentStatusBadgeColor(status: string | null): string {
  switch (status) {
    case "completed":
      return "success.main";
    case "failed":
    case "error":
      return "error.main";
    case "cancelled":
    case "canceled":
      return "warning.main";
    default:
      return "info.main";
  }
}
