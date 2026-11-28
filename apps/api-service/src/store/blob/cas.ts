import { StoreConflictError } from "@/errors";
import type { BlobBucket } from "@/store/blob/types";

export type CasOptions = { retries?: number };

/**
 * Read-modify-write with optimistic concurrency.
 * `fn` returns the new value, `undefined` for no change, or `null` to delete.
 * Returns the final stored value (null when absent/deleted).
 */
export async function casUpdate<T>(
  bucket: BlobBucket,
  key: string,
  fn: (current: T | null) => T | null | undefined | Promise<T | null | undefined>,
  { retries = 5 }: CasOptions = {},
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const existing = await bucket.get(key);
    const current = existing ? (existing.value as T) : null;
    const next = await fn(current);

    if (next === undefined) {
      return current;
    }
    if (next === null) {
      if (existing) {
        await bucket.delete([key]);
      }
      return null;
    }

    const written = await bucket.put(key, next, existing ? { ifMatch: existing.etag } : { ifNoneMatch: "*" });
    if (written) {
      return next;
    }
  }
  throw new StoreConflictError(key);
}

/** Creates the object only when absent. Returns the winning value. */
export async function putIfAbsent<T>(
  bucket: BlobBucket,
  key: string,
  value: T,
): Promise<{ created: boolean; value: T }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await bucket.put(key, value, { ifNoneMatch: "*" })) {
      return { created: true, value };
    }
    const existing = await bucket.get(key);
    if (existing) {
      return { created: false, value: existing.value as T };
    }
  }
  throw new StoreConflictError(key);
}

/** Deletes every object under a prefix. */
export async function deletePrefix(bucket: BlobBucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list(prefix, cursor);
    if (page.keys.length > 0) {
      await bucket.delete(page.keys);
    }
    cursor = page.cursor;
  } while (cursor);
}
