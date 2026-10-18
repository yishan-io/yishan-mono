import { request } from "@renderer/rpc";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { taskHubPreferenceClient } from "./taskHubPreferenceClient";
vi.mock("@renderer/rpc/client", () => ({ request: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
describe("Task Hub preference boundary", () => {
  it("roundtrips only filters over an independent scope and preserves empty arrays", async () => {
    const filters = {
      projectId: "project",
      workspaceId: "workspace",
      status: ["done" as const],
      priority: "high" as const,
      tags: [],
      tagIds: [],
    };
    vi.mocked(request).mockResolvedValue({
      found: true,
      value: { isInitialized: true, filters: { ...filters, searchQuery: "not persisted" } },
    });
    const filtersWithSearch = { ...filters, searchQuery: "memory-only" };
    await expect(taskHubPreferenceClient.save("org", filtersWithSearch)).resolves.toEqual({
      isInitialized: true,
      filters,
    });
    expect(request).toHaveBeenCalledExactlyOnceWith("preferences.set", {
      scope: "org",
      key: "task.filter",
      value: { isInitialized: true, filters },
    });
    await expect(taskHubPreferenceClient.load("org")).resolves.toEqual({ isInitialized: true, filters });
    expect(request).toHaveBeenLastCalledWith("preferences.get", {
      scope: "org",
      key: "task.filter",
    });
  });
  it.each([
    null,
    {},
    { isInitialized: true, filters: { workspaceId: 1 } },
    { isInitialized: true, filters: { tags: [false] } },
    { isInitialized: true, filters: null },
    { isInitialized: true, filters: { status: ["invalid"] } },
    { isInitialized: true, filters: { priority: "urgent" } },
    { isInitialized: true, filters: { tagIds: [1] } },
    { isInitialized: true, filters: { projectId: 1 } },
  ])("rejects invalid payload %j", async (payload) => {
    vi.mocked(request).mockResolvedValue({ found: true, value: payload });
    await expect(taskHubPreferenceClient.load("org")).rejects.toThrow(TypeError);
  });
  it("distinguishes missing from saved defaults and rejects unacknowledged writes", async () => {
    vi.mocked(request).mockResolvedValue({ found: false });
    await expect(taskHubPreferenceClient.load("org")).resolves.toEqual({ isInitialized: false, filters: {} });
    await expect(taskHubPreferenceClient.save("org", {})).rejects.toThrow("not acknowledged");
  });
});
