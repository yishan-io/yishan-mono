export type BlobPutOptions = {
  /** Only write when the stored object's etag equals this value. */
  ifMatch?: string;
  /** Only write when no object exists at the key. */
  ifNoneMatch?: "*";
};

export type BlobReadResult = { value: unknown; etag: string };

export type BlobListResult = { keys: string[]; cursor?: string };

/** Minimal JSON object store with conditional writes. */
export interface BlobBucket {
  get(key: string): Promise<BlobReadResult | null>;
  /** Returns null when a precondition failed. */
  put(key: string, value: unknown, opts?: BlobPutOptions): Promise<{ etag: string } | null>;
  delete(keys: string[]): Promise<void>;
  list(prefix: string, cursor?: string): Promise<BlobListResult>;
}
