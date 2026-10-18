import { sessionStore } from "@renderer/domains/session";
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localTaskClient } from "../daemon/localTaskDaemonClient";
import type { LocalTaskFilters } from "../localTaskTypes";
import { localTaskStore } from "../state/localTaskStore";
import {
  reconcileTaskHubTagFilter,
  refreshLocalTaskHub,
  setLocalTaskHubFilters,
  startTaskHub,
} from "./taskHubCommands";

const preferenceIO = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@renderer/rpc/client", () => ({
  request: async (method: string, params: { scope: string; value?: { filters: LocalTaskFilters } }) => {
    const preference =
      method === "preferences.get"
        ? await preferenceIO.load(params.scope)
        : await preferenceIO.save(params.scope, params.value?.filters);
    return preference.isInitialized ? { found: true, value: preference } : { found: false };
  },
}));
vi.mock("../daemon/localTaskDaemonClient", () => ({
  localTaskClient: { listProjection: vi.fn(), list: vi.fn(), listTagCatalog: vi.fn() },
}));
vi.hoisted(() => {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, content: string) => entries.set(key, content),
      removeItem: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
    },
  });
});
const initialState = localTaskStore.getState();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  localTaskStore.setState(initialState, true);
  sessionStore.setState({ currentUserId: "account", daemonId: "daemon", selectedOrganizationId: "org-a" });
  vi.mocked(preferenceIO.load).mockResolvedValue({ isInitialized: false, filters: {} });
  vi.mocked(preferenceIO.save).mockImplementation(async (_org, filters) => ({
    isInitialized: true,
    filters,
  }));
  vi.mocked(localTaskClient.listProjection).mockResolvedValue({ tasks: [], projectsById: {}, total: 0 });
  vi.mocked(localTaskClient.list).mockResolvedValue([]);
  vi.mocked(localTaskClient.listTagCatalog).mockResolvedValue([]);
});

describe("Task Hub SQLite filter lifecycle", () => {
  it("restores before listing and roundtrips on a fresh in-memory store without persisting search", async () => {
    let persisted: LocalTaskFilters = { priority: "high", tagIds: [] };
    const hydration = deferred<{ isInitialized: boolean; filters: typeof persisted }>();
    vi.mocked(preferenceIO.load).mockReturnValueOnce(hydration.promise);
    const loading = refreshLocalTaskHub();
    await vi.waitFor(() => expect(preferenceIO.load).toHaveBeenCalled());
    expect(localTaskClient.listProjection).not.toHaveBeenCalled();
    expect(preferenceIO.save).not.toHaveBeenCalled();
    hydration.resolve({ isInitialized: true, filters: persisted });
    await loading;
    expect(localTaskClient.listProjection).toHaveBeenLastCalledWith(persisted, "");
    vi.mocked(preferenceIO.save).mockImplementation(async (_org, filters) => {
      persisted = filters;
      return { isInitialized: true, filters };
    });
    await setLocalTaskHubFilters({});
    localTaskStore.setState(initialState, true);
    vi.mocked(preferenceIO.load).mockImplementation(async () => ({
      isInitialized: true,
      filters: persisted,
    }));
    await refreshLocalTaskHub();
    expect(localTaskStore.getState().hubFilters).toEqual({});
    expect(preferenceIO.save).toHaveBeenCalledExactlyOnceWith("org-a", {});
  });

  it("evaluates rapid intents and preserves saved IDs across tag merge and deletion", async () => {
    let persisted: LocalTaskFilters = { status: ["new"], tagIds: ["source", "other"] };
    vi.mocked(preferenceIO.load).mockImplementation(async () => ({
      isInitialized: true,
      filters: persisted,
    }));
    vi.mocked(preferenceIO.save).mockImplementation(async (_org, filters) => {
      persisted = filters;
      return { isInitialized: true, filters };
    });
    await Promise.all([
      setLocalTaskHubFilters((current) => ({ ...current, status: [...(current.status ?? []), "done"] })),
      setLocalTaskHubFilters((current) => ({ ...current, priority: "high" })),
    ]);
    expect(persisted).toEqual({ status: ["new", "done"], tagIds: ["source", "other"], priority: "high" });

    vi.mocked(preferenceIO.save).mockClear();
    await reconcileTaskHubTagFilter("source", "target");
    expect(localTaskStore.getState().hubFilters).toEqual(persisted);
    expect(preferenceIO.save).not.toHaveBeenCalled();
    await refreshLocalTaskHub();
    expect(localTaskClient.listProjection).not.toHaveBeenCalled();
    expect(localTaskStore.getState().hubTasks).toEqual([]);
    await reconcileTaskHubTagFilter("other");
    expect(localTaskStore.getState().hubFilters.tagIds).toEqual(["source", "other"]);
    expect(preferenceIO.save).not.toHaveBeenCalled();
  });

  it("queries available stable IDs without changing saved intent", async () => {
    const filters = { tagIds: ["present"] };
    vi.mocked(preferenceIO.load).mockResolvedValue({ isInitialized: true, filters });
    vi.mocked(localTaskClient.listTagCatalog).mockResolvedValue([
      { id: "present", key: "renamed", name: "Renamed", aliases: ["Old"], color: null },
    ]);
    await refreshLocalTaskHub();
    expect(localTaskClient.listProjection).toHaveBeenCalledWith(filters, "");
    expect(localTaskStore.getState().hubFilters).toEqual(filters);
    expect(preferenceIO.save).not.toHaveBeenCalled();
  });

  it("keeps a deleted last tag selected without an org rather than broadening to all tasks", async () => {
    sessionStore.setState({ selectedOrganizationId: undefined });
    await refreshLocalTaskHub();
    localTaskStore.getState().setHubFilters({ tagIds: ["deleted"] });
    await reconcileTaskHubTagFilter("deleted");
    await refreshLocalTaskHub();
    expect(localTaskStore.getState().hubFilters).toEqual({ tagIds: ["deleted"] });
    expect(localTaskClient.listProjection).toHaveBeenCalledTimes(1);
    expect(localTaskStore.getState().hubTasks).toEqual([]);
  });

  it("keeps missing preferences unwritten", async () => {
    await refreshLocalTaskHub();
    expect(localTaskStore.getState().hubFilters).toEqual({});
    expect(preferenceIO.save).not.toHaveBeenCalled();
  });

  it.each(["selectedOrganizationId", "currentUserId", "daemonId"] as const)(
    "discards stale hydration on %s changes, including away and back",
    async (field) => {
      const hydration = deferred<{ isInitialized: boolean; filters: { priority: "high" } }>();
      vi.mocked(preferenceIO.load).mockReturnValueOnce(hydration.promise);
      const loading = refreshLocalTaskHub();
      await vi.waitFor(() => expect(preferenceIO.load).toHaveBeenCalled());
      const original = sessionStore.getState()[field];
      sessionStore.setState({ [field]: "other" });
      sessionStore.setState({ [field]: original });
      hydration.resolve({ isInitialized: true, filters: { priority: "high" } });
      await loading;
      expect(localTaskClient.listProjection).not.toHaveBeenCalled();
      expect(localTaskStore.getState().hubFilters).toEqual({});
    },
  );

  it("serializes rapid latest intents and keeps failed writes out of memory", async () => {
    const firstWrite = deferred<{ isInitialized: boolean; filters: { priority: "high" } }>();
    vi.mocked(preferenceIO.save).mockReturnValueOnce(firstWrite.promise);
    const first = setLocalTaskHubFilters({ priority: "high" });
    const second = setLocalTaskHubFilters({ status: ["done"] });
    await vi.waitFor(() => expect(preferenceIO.save).toHaveBeenCalledTimes(1));
    firstWrite.resolve({ isInitialized: true, filters: { priority: "high" } });
    await Promise.all([first, second]);
    expect(localTaskStore.getState().hubFilters).toEqual({ status: ["done"] });
    vi.mocked(preferenceIO.load).mockResolvedValue({ isInitialized: true, filters: { status: ["done"] } });
    vi.mocked(preferenceIO.save).mockRejectedValueOnce(new Error("disk full"));
    await setLocalTaskHubFilters({ priority: "low" });
    expect(localTaskStore.getState().hubFilters).toEqual({ status: ["done"] });
    expect(localTaskStore.getState().hubError).toBe("disk full");
    await setLocalTaskHubFilters({});
    expect(localTaskStore.getState().hubFilters).toEqual({});
  });

  it("keeps writes serialized across deselection and discards stale write acknowledgements", async () => {
    const oldWrite = deferred<{ isInitialized: boolean; filters: LocalTaskFilters }>();
    vi.mocked(preferenceIO.save).mockReturnValueOnce(oldWrite.promise);
    const old = setLocalTaskHubFilters({ priority: "high" });
    await vi.waitFor(() => expect(preferenceIO.save).toHaveBeenCalledTimes(1));
    sessionStore.setState({ selectedOrganizationId: undefined });
    await refreshLocalTaskHub();
    sessionStore.setState({ selectedOrganizationId: "org-a" });
    const latest = setLocalTaskHubFilters({ status: ["done"] });
    await Promise.resolve();
    expect(preferenceIO.save).toHaveBeenCalledTimes(1);
    oldWrite.resolve({ isInitialized: true, filters: { priority: "high" } });
    await Promise.all([old, latest]);
    expect(localTaskStore.getState().hubFilters).toEqual({ status: ["done"] });
    expect(preferenceIO.save).toHaveBeenLastCalledWith("org-a", { status: ["done"] });
  });

  it("does not list or write after hydration failure and retries successfully", async () => {
    vi.mocked(preferenceIO.load).mockRejectedValueOnce(new Error("offline"));
    await setLocalTaskHubFilters({ priority: "high" });
    expect(localTaskClient.listProjection).not.toHaveBeenCalled();
    expect(preferenceIO.save).not.toHaveBeenCalled();
    expect(localTaskStore.getState().hubError).toBe("offline");
    await refreshLocalTaskHub();
    expect(localTaskClient.listProjection).toHaveBeenCalledWith({}, "");
  });

  it("reloads mounted Hub for org switches and rejects stale list responses", async () => {
    const listing = deferred<Awaited<ReturnType<typeof localTaskClient.listProjection>>>();
    vi.mocked(localTaskClient.listProjection).mockReturnValueOnce(listing.promise);
    const stop = startTaskHub();
    try {
      await vi.waitFor(() => expect(localTaskClient.listProjection).toHaveBeenCalledTimes(1));
      sessionStore.setState({ selectedOrganizationId: "org-b" });
      await vi.waitFor(() => expect(preferenceIO.load).toHaveBeenLastCalledWith("org-b"));
      listing.resolve({
        tasks: [],
        projectsById: { stale: { id: "stale", name: "Stale", icon: "", color: "" } },
        total: 0,
      });
      await vi.waitFor(() => expect(localTaskStore.getState().hubLoadState).toBe("loaded"));
      expect(localTaskStore.getState().hubProjectDisplayById).toEqual({});
    } finally {
      stop();
    }
  });
});
