import { describe, expect, it } from "vitest";
import { createNavigatorOrderComparator, reconcileOrder, reorderIds } from "./workspaceNavigatorOrder";

describe("navigator sibling order", () => {
  it("sorts saved ranks first, valid times ascending, and unknown times last with ID ties", () => {
    const compare = createNavigatorOrderComparator(["ranked-z", "ranked-a"]);
    const siblings = [
      { id: "missing" },
      { id: "invalid", createdAt: "bad" },
      { id: "ranked-a" },
      { id: "ranked-z" },
      { id: "z", createdAt: "2026-01-01T00:00:00Z" },
      { id: "a", createdAt: "2025-12-31T19:00:00-05:00" },
      { id: "later", createdAt: "2026-02-01T00:00:00Z" },
    ];
    const expected = ["ranked-z", "ranked-a", "a", "z", "later", "invalid", "missing"];
    for (let offset = 0; offset < siblings.length; offset++) {
      const shuffled = [...siblings.slice(offset), ...siblings.slice(0, offset)].reverse();
      expect(shuffled.sort(compare).map((sibling) => sibling.id)).toEqual(expected);
    }
    for (const a of siblings) {
      expect(compare(a, a)).toBe(0);
      for (const b of siblings) {
        expect(compare(a, b) + compare(b, a)).toBe(0);
        for (const c of siblings) {
          if (compare(a, b) <= 0 && compare(b, c) <= 0) {
            expect(compare(a, c)).toBeLessThanOrEqual(0);
          }
        }
      }
    }
  });

  it("reconciles complete dragged groups and retains survivor order across append/remove", () => {
    const saved = reorderIds({ ids: ["a", "b", "c", "d"], draggedId: "d", targetId: "b", position: "before" });
    expect(saved).toEqual(["a", "d", "b", "c"]);
    expect(reconcileOrder(saved, ["new", "c", "d", "a"])).toEqual(["a", "d", "c", "new"]);
    expect(reorderIds({ ids: saved, draggedId: "missing", targetId: "b", position: "after" })).toEqual(saved);
  });
});
