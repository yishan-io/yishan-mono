import { describe, expect, it } from "vitest";
import { createTranscriptState } from "./compose";
import { createIdentityAllocator, getCallAnchor, getSourceAnchors } from "./identity";
import type { IdentityEntry } from "./types";

const sourceAnchor = (id: string): string => {
  const anchor = getSourceAnchors({ id, stability: "stable", origin: "snapshot" })[0];
  if (anchor === undefined) throw new Error("expected stable source anchor");
  return anchor;
};
const entry = (id: string, anchors: readonly string[], kind = "user", scope = "session"): IdentityEntry =>
  Object.freeze({ id, kind, scope, anchors: Object.freeze([...anchors]) });
const previous = (registry: readonly IdentityEntry[]) =>
  Object.freeze({
    ...createTranscriptState({ sessionId: "s", namespace: "test", seed: 0 }),
    registry: Object.freeze([...registry]),
  });

function trackEmptyEntries(count: number) {
  let kindVisits = 0;
  let anchorVisits = 0;
  const registry: IdentityEntry[] = Array.from({ length: count }, (_, index) =>
    Object.freeze({
      id: `old-${index}`,
      get kind() {
        kindVisits++;
        return "user";
      },
      scope: "session",
      get anchors() {
        anchorVisits++;
        return [];
      },
    }),
  );
  return { registry, counts: () => ({ kindVisits, anchorVisits }) };
}

describe("identity allocation", () => {
  it("visits only linear old candidates for 1000 stable-anchor allocations", () => {
    const count = 1000;
    let kindVisits = 0;
    let anchorVisits = 0;
    const anchors = Array.from({ length: count }, (_, index) => sourceAnchor(`stable-${index}`));
    const registrations = anchors.map((anchor, index) =>
      Object.freeze({
        id: `old-${index}`,
        get kind() {
          kindVisits++;
          return "user";
        },
        scope: "session",
        get anchors() {
          anchorVisits++;
          return Object.freeze([anchor]);
        },
      }),
    );
    const state = previous(registrations);
    const allocator = createIdentityAllocator(state, new Set(anchors));
    const ids = anchors.map((anchor) => allocator.allocate("user", "session", [anchor]));
    console.info("identity stable-candidate counters", { kindVisits, anchorVisits });
    expect(ids).toEqual(anchors.map((_, index) => `old-${index}`));
    expect(allocator.finish().counter).toBe(0);
    expect(allocator.finish().registry).toEqual(
      anchors.map((anchor, index) => ({ id: `old-${index}`, kind: "user", scope: "session", anchors: [anchor] })),
    );
    expect(state.counter).toBe(0);
    expect(state.registry).toEqual(registrations);
    expect(Object.isFrozen(state.registry)).toBe(true);
    expect(kindVisits).toBeLessThanOrEqual(count * 2);
    expect(anchorVisits).toBeLessThanOrEqual(count * 3);
  });

  it("isolates collision-prone kinds/scopes and deduplicates anchors without caching eligibility", () => {
    const state = previous([
      entry("collision", ["c"], "a", "b"),
      entry("duplicate", ["b", "b", "c"], "a", ""),
      entry("same-id", ["c"], "a", ""),
      entry("same-id", ["d"], "a", ""),
      entry("other-scope", ["c"], "a", "other"),
    ]);
    const eligible = new Set(["b", "c", "d"]);
    const allocator = createIdentityAllocator(state, eligible);
    expect(allocator.allocate("a", "", ["c", "c"])).toBe("same-id");
    eligible.delete("b");
    expect(allocator.allocate("a", "", ["c", "c"])).toBe("duplicate");
    expect(allocator.allocate("a", "", ["d"])).toBe(JSON.stringify(["test", "s", 0]));
    expect(allocator.allocate("a", "b", ["c"])).toBe("collision");
    expect(allocator.allocate("a", "other", ["c"])).toBe("other-scope");
    expect(allocator.allocate("a", "", [])).toBe(JSON.stringify(["test", "s", 1]));
    expect(allocator.finish().counter).toBe(2);
    expect(state.registry.map((registration) => registration.anchors)).toEqual([
      ["c"],
      ["b", "b", "c"],
      ["c"],
      ["d"],
      ["c"],
    ]);
  });

  it("does not repeatedly visit old entries for 1000 anchorless allocations or stable candidates", () => {
    const count = 1000;
    const tracked = trackEmptyEntries(count);
    const stable = sourceAnchor("stable");
    const state = previous([...tracked.registry, entry("stable-id", [stable])]);
    const allocator = createIdentityAllocator(state, new Set([stable]));
    const ids = Array.from({ length: count }, () => allocator.allocate("user", "session", []));
    const anchorlessCounts = tracked.counts();
    expect(allocator.allocate("user", "session", [stable])).toBe("stable-id");
    const stableCounts = tracked.counts();
    console.info("identity old-entry counters", { anchorlessCounts, stableCounts });
    expect(anchorlessCounts.kindVisits).toBe(0);
    expect(anchorlessCounts.anchorVisits).toBeLessThanOrEqual(count);
    expect(stableCounts).toEqual(anchorlessCounts);
    expect(new Set(ids).size).toBe(count);
    expect(ids[0]).toBe(JSON.stringify(["test", "s", 0]));
    expect(allocator.finish().counter).toBe(count);
    expect(allocator.finish().registry).toHaveLength(count + 1);
    expect(state.counter).toBe(0);
    expect(state.registry).toHaveLength(count + 1);
  });

  it("merges by old registration order, not candidate source/call anchor order", () => {
    const source = sourceAnchor("assistant");
    const call = getCallAnchor("tool");
    const state = previous([
      entry("empty", []),
      entry("wrong-kind", [source], "group"),
      entry("wrong-scope", [source], "user", "other"),
      entry("earliest-call", [call]),
      entry("later-source", [source]),
    ]);
    const allocator = createIdentityAllocator(state, new Set([source, call]));
    expect(allocator.allocate("user", "session", [source, call])).toBe("earliest-call");
    expect(allocator.allocate("user", "session", [call, source])).toBe("later-source");
    expect(allocator.allocate("user", "session", [source, call])).toBe(JSON.stringify(["test", "s", 0]));
    expect(state.registry.map((registration) => registration.id)).toEqual([
      "empty",
      "wrong-kind",
      "wrong-scope",
      "earliest-call",
      "later-source",
    ]);
  });

  it("splits at the earliest surviving old anchor and honors per-allocation eligibility", () => {
    const removed = sourceAnchor("removed");
    const source = sourceAnchor("assistant");
    const call = getCallAnchor("tool");
    const state = previous([entry("old", [removed, source, call])]);
    const allocator = createIdentityAllocator(state, new Set([source, call]));
    expect(allocator.allocate("user", "session", [call])).toBe(JSON.stringify(["test", "s", 0]));
    expect(allocator.allocate("user", "session", [source])).toBe("old");
    const restricted = createIdentityAllocator(state, new Set([source, call]));
    expect(restricted.allocate("user", "session", [call], new Set([call]))).toBe("old");
    expect(state.registry[0]?.anchors).toEqual([removed, source, call]);
  });
});
