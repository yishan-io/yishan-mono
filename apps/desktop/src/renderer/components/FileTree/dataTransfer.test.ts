import { describe, expect, it, vi } from "vitest";
import { FILETREE_DRAG_MIME, resolveInternalFileTreeDragPaths } from "./dataTransfer";

function createDataTransfer(payload: string): DataTransfer {
  return {
    getData: (type: string) => (type === FILETREE_DRAG_MIME ? payload : ""),
  } as DataTransfer;
}

describe("resolveInternalFileTreeDragPaths", () => {
  it("resolves symlinked drag paths through the host bridge", async () => {
    const resolveRealPath = vi.fn().mockResolvedValue({ path: "/repo/marketing" });
    vi.stubGlobal("window", {
      __YISHAN__: {
        host: {
          resolveRealPath,
        },
      },
    });

    await expect(
      resolveInternalFileTreeDragPaths(createDataTransfer(JSON.stringify(["/repo/.my-context/marketing"]))),
    ).resolves.toEqual(["/repo/marketing"]);

    expect(resolveRealPath).toHaveBeenCalledWith("/repo/.my-context/marketing");
  });

  it("falls back to the original path when canonicalization fails", async () => {
    const resolveRealPath = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("window", {
      __YISHAN__: {
        host: {
          resolveRealPath,
        },
      },
    });

    await expect(
      resolveInternalFileTreeDragPaths(createDataTransfer(JSON.stringify(["/repo/.my-context/marketing"]))),
    ).resolves.toEqual(["/repo/.my-context/marketing"]);
  });
});
