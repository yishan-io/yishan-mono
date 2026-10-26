/** Formats a worked duration like "worked 3s", "worked 1m 5s", or "worked 1h5m". */
export function formatTurnDuration(durationMs: number): string {
  const roundedMs = Math.round(durationMs);
  if (roundedMs < 1000) {
    return `${roundedMs}ms`;
  }
  const seconds = Math.floor(roundedMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
  }
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
