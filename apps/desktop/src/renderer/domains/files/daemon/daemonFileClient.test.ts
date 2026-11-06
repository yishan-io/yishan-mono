import { describe, expect, it, vi } from "vitest";
import { DaemonFileClient } from "./daemonFileClient";

vi.mock("@renderer/rpc", () => ({ request: vi.fn() }));

const directory = { path: "src", name: "src", isDir: true, isIgnored: false, size: 0, mode: 493, modifiedAt: "" };

describe("file listing freshness delivery", () => {
  it.each([true, false])("opts in and preserves freshness %s", async (isFresh) => {
    const invoke = vi.fn().mockResolvedValue({ files: [directory], isFresh });
    const response = await new DaemonFileClient(invoke).listFiles({ workspaceId: "ws", includeFreshness: true });
    expect(invoke).toHaveBeenCalledWith("file.list", {
      workspaceId: "ws", path: "", recursive: true, includeFreshness: true,
    });
    expect(response).toEqual({ files: [{ ...directory, path: "src/" }], isFresh });
  });

  it("keeps legacy requests and array parsing unchanged", async () => {
    const invoke = vi.fn().mockResolvedValue([directory]);
    expect(await new DaemonFileClient(invoke).listFiles({ workspaceId: "ws" })).toEqual({
      files: [{ ...directory, path: "src/" }],
    });
    expect(invoke).toHaveBeenCalledWith("file.list", { workspaceId: "ws", path: "", recursive: true });
  });

  it.each([null, [], { files: [], isFresh: "true" }, { files: [null], isFresh: false },
    { files: [{ ...directory, path: 4 }], isFresh: true }])("rejects malformed envelopes safely: %j", async (payload) => {
    const client = new DaemonFileClient(vi.fn().mockResolvedValue(payload));
    await expect(client.listFiles({ workspaceId: "ws", includeFreshness: true })).rejects.toThrow("Invalid file.list snapshot");
  });
});

it("accepts repeated serialized empty shallow snapshots", async () => {
  const invoke = vi.fn().mockImplementation(async () => JSON.parse('{"files":[],"isFresh":true}'));
  const client = new DaemonFileClient(invoke);
  for (let request = 0; request < 2; request++) {
    await expect(client.listFiles({ workspaceId: "ws", recursive: false, includeFreshness: true }))
      .resolves.toEqual({ files: [], isFresh: true });
  }
});
