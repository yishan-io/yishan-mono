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
  type Candidate = { entry: IdentityEntry; anchors: readonly string[]; rank: number };
  const index = new Map<string, Map<string, Map<string, Candidate[]>>>();
  previous.registry.forEach((entry, rank) => {
    const anchors = entry.anchors;
    // Empty registrations never match, and must not incur kind/scope lookups.
    if (anchors.length === 0) return;
    const kind = entry.kind;
    let scopes = index.get(kind);
    if (!scopes) {
      scopes = new Map();
      index.set(kind, scopes);
    }
    let byAnchor = scopes.get(entry.scope);
    if (!byAnchor) {
      byAnchor = new Map();
      scopes.set(entry.scope, byAnchor);
    }
    const candidate = { entry, anchors, rank };
    for (const anchor of new Set(anchors)) {
      let candidates = byAnchor.get(anchor);
      if (!candidates) {
        candidates = [];
        byAnchor.set(anchor, candidates);
      }
      candidates.push(candidate);
    }
  });
  return {
    allocate(kind: string, scope: string, anchors: readonly string[], eligibleAnchors = activeAnchors): string {
      let earliest: Candidate | undefined;
      const byAnchor = index.get(kind)?.get(scope);
      if (anchors.length > 0 && byAnchor) {
        const visited = new Set<Candidate>();
        for (const anchor of anchors) {
          for (const candidate of byAnchor.get(anchor) ?? []) {
            if (visited.has(candidate)) continue;
            visited.add(candidate);
            if (claimed.has(candidate.entry.id) || (earliest && candidate.rank >= earliest.rank)) continue;
            // Eligibility can change between allocations, even for the same Set.
            const surviving = candidate.anchors.find((oldAnchor) => eligibleAnchors.has(oldAnchor));
            if (surviving !== undefined && anchors.includes(surviving)) earliest = candidate;
          }
        }
      }
      const previousEntry = earliest?.entry;
      const id = previousEntry?.id ?? JSON.stringify([previous.namespace, previous.sessionId, counter++]);
      claimed.add(id);
      registry.push({ id, kind, scope, anchors });
      return id;
    },
    finish: () => ({ counter, registry }),
  };
}
