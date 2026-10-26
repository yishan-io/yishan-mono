import type { IdentityEntry, TranscriptObservation, TranscriptSource, TranscriptState } from "./types";

/** Collision-safe stable source anchor; generated IDs deliberately contribute nothing. */
export function getSourceAnchors(source: TranscriptSource): string[] {
  return source.stability === "stable" ? [JSON.stringify(["source", source.id])] : [];
}

/** Collision-safe call anchor within the state's session. */
export function getCallAnchor(callId: string): string {
  return JSON.stringify(["call", callId]);
}

/** Stable source first, then shared calls; never hashes or deduplicates text. */
export function getObservationAnchors(observation: TranscriptObservation): string[] {
  const anchors = getSourceAnchors(observation.source);
  if (observation.kind === "assistant") {
    for (const block of observation.blocks) if (block.kind === "tool") anchors.push(getCallAnchor(block.callId));
  } else if (observation.kind === "unresolved") anchors.push(getCallAnchor(observation.callId));
  return anchors;
}

/**
 * Per-composition allocator. A split inherits at the earliest surviving old anchor;
 * a merge selects the earliest old registration. Scope keeps groups tied to turns.
 * Registrations are replaced by only those claimed by the active projection.
 */
export function createIdentityAllocator(previous: TranscriptState, activeAnchors: ReadonlySet<string>) {
  let counter = previous.counter;
  const registry: IdentityEntry[] = [];
  const claimed = new Set<string>();
  // Empty registrations can never match; preserve the order of all possible matches.
  const anchoredEntries = previous.registry.filter((entry) => entry.anchors.length > 0);
  return {
    allocate(kind: string, scope: string, anchors: readonly string[], eligibleAnchors = activeAnchors): string {
      const previousEntry =
        anchors.length === 0
          ? undefined
          : anchoredEntries.find((entry) => {
              if (entry.kind !== kind || entry.scope !== scope || claimed.has(entry.id)) return false;
              const surviving = entry.anchors.find((anchor) => eligibleAnchors.has(anchor));
              return surviving !== undefined && anchors.includes(surviving);
            });
      const id = previousEntry?.id ?? JSON.stringify([previous.namespace, previous.sessionId, counter++]);
      claimed.add(id);
      registry.push({ id, kind, scope, anchors });
      return id;
    },
    finish: () => ({ counter, registry }),
  };
}
