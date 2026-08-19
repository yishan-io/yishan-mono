/**
 * Resource-usage formatting (desktop7 Phase 26).
 *
 * Feature-private display helpers for the workspace-resource-usage Feature.
 */

/**
 * Formats one CPU percentage for compact metrics display.
 *
 * @example
 * ```ts
 * formatCpuPercent(45.678) // "45.7%"
 * ```
 */
export function formatCpuPercent(value: number): string {
  return `${Math.max(0, value).toFixed(1)}%`;
}

/**
 * Formats one byte value to one concise MB/GB memory label.
 *
 * @example
 * ```ts
 * formatMemoryBytes(1_500_000_000) // "1.4 GB"
 * formatMemoryBytes(52_428_800)    // "50 MB"
 * ```
 */
export function formatMemoryBytes(value: number): string {
  const safeValue = Math.max(0, value);
  const gb = safeValue / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = safeValue / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}
