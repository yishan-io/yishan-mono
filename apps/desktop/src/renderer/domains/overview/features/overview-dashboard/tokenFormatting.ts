/**
 * Token-count formatting (desktop7 Phase 26).
 *
 * Feature-private display helper for the overview-dashboard Feature.
 */

/**
 * Formats token counts with compact K/M/B suffixes.
 *
 * @example
 * ```ts
 * formatTokens(1_500) // "1.5K"
 * formatTokens(2_500_000) // "2.5M"
 * formatTokens(3_750_000_000) // "3.8B"
 * ```
 */
export function formatTokens(value: number | null): string {
  if (value == null) {
    return "0";
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}
