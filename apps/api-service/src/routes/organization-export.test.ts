import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv } from "@/hono";
import { organizationExportRouter } from "@/routes/organization-export";

describe("organizationExportRouter", () => {
  let app: Hono<AppEnv>;
  const mockGetMembershipRole = vi.fn();
  const mockExportProjectsCsv = vi.fn();
  const mockExportWorkspacesCsv = vi.fn();
  const mockExportTokenUsageHourlyCsv = vi.fn();

  beforeEach(() => {
    mockGetMembershipRole.mockReset();
    mockExportProjectsCsv.mockReset();
    mockExportWorkspacesCsv.mockReset();
    mockExportTokenUsageHourlyCsv.mockReset();

    app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("sessionUser", { id: "user-1" });
      c.set("services", {
        organization: {
          getMembershipRole: mockGetMembershipRole,
        },
        organizationExport: {
          exportProjectsCsv: mockExportProjectsCsv,
          exportWorkspacesCsv: mockExportWorkspacesCsv,
          exportTokenUsageHourlyCsv: mockExportTokenUsageHourlyCsv,
        },
      } as never);
      await next();
    });
    app.route("/", organizationExportRouter);
  });

  it("returns projects CSV as a downloadable attachment", async () => {
    mockGetMembershipRole.mockResolvedValue("member");
    mockExportProjectsCsv.mockResolvedValue({
      fileName: "organization-org-1-projects.csv",
      contentType: "text/csv; charset=utf-8",
      body: "id\nproject-1",
    });

    const response = await app.request("http://localhost/orgs/org-1/export?type=project");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="organization-org-1-projects.csv"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("id\nproject-1");
    expect(mockGetMembershipRole).toHaveBeenCalledWith({ organizationId: "org-1", userId: "user-1" });
    expect(mockExportProjectsCsv).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      actorRole: "member",
    });
  });

  it("returns workspaces CSV for type=workspace", async () => {
    mockGetMembershipRole.mockResolvedValue("member");
    mockExportWorkspacesCsv.mockResolvedValue({
      fileName: "organization-org-1-workspaces.csv",
      contentType: "text/csv; charset=utf-8",
      body: "id\nworkspace-1",
    });

    const response = await app.request("http://localhost/orgs/org-1/export?type=workspace");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("id\nworkspace-1");
    expect(mockExportWorkspacesCsv).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      actorRole: "member",
    });
  });

  it("returns token usage CSV for type=usage", async () => {
    mockGetMembershipRole.mockResolvedValue("member");
    mockExportTokenUsageHourlyCsv.mockResolvedValue({
      fileName: "organization-org-1-token-usage-hourly.csv",
      contentType: "text/csv; charset=utf-8",
      body: "id\nusage-1",
    });

    const response = await app.request("http://localhost/orgs/org-1/export?type=usage");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("id\nusage-1");
    expect(mockExportTokenUsageHourlyCsv).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      actorRole: "member",
    });
  });
});
