import { StoreConflictError } from "@/errors";
import { casUpdate, putIfAbsent } from "@/store/blob/cas";
import { MemoryBlobBucket } from "@/store/blob/memory-bucket";
import type { BlobBucket } from "@/store/blob/types";
import { describe, expect, it } from "vitest";

/** Wraps a bucket so `onGet` runs right after each read, simulating a concurrent writer. */
function interfering(bucket: MemoryBlobBucket, onGet: (n: number) => Promise<void>): BlobBucket {
  let reads = 0;
  return {
    get: async (key) => {
      const result = await bucket.get(key);
      reads += 1;
      await onGet(reads);
      return result;
    },
    put: (k, v, o) => bucket.put(k, v, o),
    delete: (k) => bucket.delete(k),
    list: (p, c) => bucket.list(p, c),
  };
}

describe("MemoryBlobBucket", () => {
  it("issues a new etag per write and enforces preconditions", async () => {
    const b = new MemoryBlobBucket();
    const first = await b.put("k", 1, { ifNoneMatch: "*" });
    expect(first).not.toBeNull();
    expect(await b.put("k", 2, { ifNoneMatch: "*" })).toBeNull();
    expect(await b.put("k", 2, { ifMatch: "wrong" })).toBeNull();
    const second = await b.put("k", 2, { ifMatch: first?.etag });
    expect(second?.etag).not.toBe(first?.etag);
    expect(await b.put("missing", 1, { ifMatch: "x" })).toBeNull();
  });
});

describe("casUpdate", () => {
  it("creates, updates, skips and deletes", async () => {
    const b = new MemoryBlobBucket();
    expect(await casUpdate<number>(b, "k", (c) => (c ?? 0) + 1)).toBe(1);
    expect(await casUpdate<number>(b, "k", (c) => (c ?? 0) + 1)).toBe(2);
    expect(await casUpdate<number>(b, "k", () => undefined)).toBe(2);
    expect(await casUpdate<number>(b, "k", () => null)).toBeNull();
    expect(await b.get("k")).toBeNull();
  });

  it("retries after a concurrent write and applies fn to the fresh value", async () => {
    const mem = new MemoryBlobBucket();
    await mem.put("k", 10);
    const bucket = interfering(mem, async (n) => {
      if (n === 1) {
        const cur = await mem.get("k");
        await mem.put("k", 100, { ifMatch: cur?.etag });
      }
    });
    expect(await casUpdate<number>(bucket, "k", (c) => (c ?? 0) + 1)).toBe(101);
  });

  it("retries on a concurrent create when the key was absent", async () => {
    const mem = new MemoryBlobBucket();
    const bucket = interfering(mem, async (n) => {
      if (n === 1) {
        await mem.put("k", 5);
      }
    });
    expect(await casUpdate<number>(bucket, "k", (c) => (c ?? 0) + 1)).toBe(6);
  });

  it("throws StoreConflictError after exhausting retries", async () => {
    const mem = new MemoryBlobBucket();
    await mem.put("k", 0);
    const bucket = interfering(mem, async () => {
      const cur = await mem.get("k");
      await mem.put("k", Math.random(), { ifMatch: cur?.etag });
    });
    const err = await casUpdate<number>(bucket, "k", (c) => (c ?? 0) + 1, { retries: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(StoreConflictError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("STORE_CONFLICT");
  });
});

describe("putIfAbsent", () => {
  it("returns the existing value when it loses the race", async () => {
    const b = new MemoryBlobBucket();
    const [a, c] = await Promise.all([putIfAbsent(b, "k", "a"), putIfAbsent(b, "k", "c")]);
    expect([a.created, c.created].filter(Boolean)).toHaveLength(1);
    expect(a.value).toBe(c.value);
  });
});
