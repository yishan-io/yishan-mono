import type { BlobBucket, BlobListResult, BlobPutOptions, BlobReadResult } from "@/store/blob/types";

const DELETE_BATCH = 1000;

/** BlobBucket over a Cloudflare Workers R2 binding. */
export class R2BlobBucket implements BlobBucket {
  constructor(private readonly bucket: R2Bucket) {}

  async get(key: string): Promise<BlobReadResult | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }
    return { value: await object.json(), etag: object.etag };
  }

  async put(key: string, value: unknown, opts?: BlobPutOptions): Promise<{ etag: string } | null> {
    const options: R2PutOptions = { httpMetadata: { contentType: "application/json" } };
    if (opts?.ifMatch) {
      options.onlyIf = { etagMatches: opts.ifMatch };
    } else if (opts?.ifNoneMatch) {
      options.onlyIf = new Headers({ "If-None-Match": opts.ifNoneMatch });
    }
    const result = await this.bucket.put(key, JSON.stringify(value), options);
    return result ? { etag: result.etag } : null;
  }

  async delete(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      await this.bucket.delete(keys.slice(i, i + DELETE_BATCH));
    }
  }

  async list(prefix: string, cursor?: string): Promise<BlobListResult> {
    const result = await this.bucket.list({ prefix, cursor });
    return {
      keys: result.objects.map((o) => o.key),
      cursor: result.truncated ? result.cursor : undefined,
    };
  }
}
