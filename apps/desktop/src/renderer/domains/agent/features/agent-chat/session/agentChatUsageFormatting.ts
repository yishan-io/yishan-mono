/**
 * Agent-chat usage display formatting (desktop8 Phase 29).
 *
 * Token-count formatting moved out of the Agent Model into the Agent Chat
 * feature; the Model keeps the numeric calculations only.
 */

const tokenCountFormatter = new Intl.NumberFormat("en-US");

function formatCompactTokenCount(tokenCount: number): string {
  const roundedTokenCount = Math.max(0, Math.round(tokenCount));
  if (roundedTokenCount >= 1_000_000) {
    return formatCompactTokenSuffix(roundedTokenCount / 1_000_000, "M");
  }

  if (roundedTokenCount >= 1_000) {
    return formatCompactTokenSuffix(roundedTokenCount / 1_000, "K");
  }

  return String(roundedTokenCount);
}

function formatCompactTokenSuffix(value: number, suffix: "K" | "M"): string {
  const roundedValue = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const compactValue = Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(1);
  return `${compactValue}${suffix}`;
}

/** Formats one token count for detailed tooltip display. */
export function formatDetailedTokenCount(tokenCount: number): string {
  const roundedTokenCount = Math.max(0, Math.round(tokenCount));
  if (roundedTokenCount >= 1_000) {
    return formatCompactTokenCount(roundedTokenCount);
  }

  return tokenCountFormatter.format(roundedTokenCount);
}
