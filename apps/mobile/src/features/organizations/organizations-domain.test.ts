import { describe, expect, it } from "vitest";

import { normalizeOrganization } from "./organizations-domain";

describe("organizations-domain", () => {
  it("normalizes member arrays into feature-ready counts", () => {
    expect(
      normalizeOrganization({
        createdAt: "2026-06-16T00:00:00.000Z",
        id: "org-1",
        members: [
          { avatarUrl: null, email: "a@example.com", name: "A", role: "owner", userId: "u1" },
          { avatarUrl: null, email: "b@example.com", name: "B", role: "member", userId: "u2" },
        ],
        name: "Acme",
        updatedAt: "2026-06-16T00:00:00.000Z",
      }),
    ).toEqual({
      createdAt: "2026-06-16T00:00:00.000Z",
      id: "org-1",
      memberCount: 2,
      name: "Acme",
      updatedAt: "2026-06-16T00:00:00.000Z",
    });
  });
});
