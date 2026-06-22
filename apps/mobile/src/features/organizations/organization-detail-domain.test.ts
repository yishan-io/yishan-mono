import { describe, expect, it } from "vitest";

import { buildOrganizationMetrics, findOrganizationById } from "./organization-detail-domain";

const t = (key: string) => key;

describe("organization-detail-domain", () => {
  const organizations = [
    {
      createdAt: "2026-06-16T00:00:00.000Z",
      id: "org-1",
      memberCount: 3,
      name: "Acme",
      updatedAt: "2026-06-16T00:00:00.000Z",
    },
  ];

  it("finds the requested organization", () => {
    expect(findOrganizationById(organizations, "org-1")?.name).toBe("Acme");
    expect(findOrganizationById(organizations, "missing")).toBeNull();
  });

  it("builds metrics from normalized organization data", () => {
    expect(
      buildOrganizationMetrics({
        nodesCount: 4,
        organization: organizations[0] ?? null,
        projectsCount: 2,
        t,
      }),
    ).toEqual([
      { label: "settings.nodesTitle", value: "4" },
      { label: "settings.projectsTitle", value: "2" },
      { label: "settings.membersTitle", value: "3" },
    ]);
  });
});
