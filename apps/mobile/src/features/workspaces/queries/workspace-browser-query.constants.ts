/**
 * Re-opening the mobile workspace browser should reuse very recent data instead of
 * immediately re-fetching every tab payload on mount.
 */
export const WORKSPACE_BROWSER_QUERY_STALE_TIME_MS = 15_000;
