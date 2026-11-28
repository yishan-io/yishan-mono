import type { BlobBucket, BlobListResult, BlobPutOptions, BlobReadResult } from "@/store/blob/types";

const LIST_PAGE_SIZE = 1000;

/** In-memory BlobBucket with real etag semantics (new etag on every write). */
export class MemoryBlobBucket implements BlobBucket {
  private readonly objects = new Map<string, { body: string; etag: string }>();
  private counter = 0;

  async get(key: string): Promise<BlobReadResult | null> {
    const object = this.objects.get(key);
    return object ? { value: JSON.parse(object.body), etag: object.etag } : null;
  }

  async put(key: string, value: unknown, opts?: BlobPutOptions): Promise<{ etag: string } | null> {
    const existing = this.objects.get(key);
    if (opts?.ifMatch !== undefined && existing?.etag !== opts.ifMatch) {
      return null;
    }
    if (opts?.ifNoneMatch === "*" && existing) {
      return null;
    }
    this.counter += 1;
    const etag = `etag-${this.counter}`;
    this.objects.set(key, { body: JSON.stringify(value), etag });
    return { etag };
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.objects.delete(key);
    }
  }

  async list(prefix: string, cursor?: string): Promise<BlobListResult> {
    const all = [...this.objects.keys()].filter((k) => k.startsWith(prefix) && (!cursor || k > cursor)).sort();
    const page = all.slice(0, LIST_PAGE_SIZE);
    return { keys: page, cursor: all.length > page.length ? page[page.length - 1] : undefined };
  }

  /** Test helper: all keys currently stored. */
  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}
