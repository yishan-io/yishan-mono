import { casUpdate } from "@/store/blob/cas";
import type { BlobBucket } from "@/store/blob/types";
import { keys } from "@/store/keys";
import type { VoiceScope, VoiceUsageRecord } from "@/store/types";

export interface VoiceQuotaStore {
  get(scope: VoiceScope, month: string): Promise<VoiceUsageRecord>;
  /** Adds seconds and one request. Returns the new totals. */
  add(scope: VoiceScope, month: string, seconds: number): Promise<VoiceUsageRecord>;
  /** Raises each counter to at least the given value (used by migration). */
  raiseTo(scope: VoiceScope, month: string, usage: VoiceUsageRecord): Promise<VoiceUsageRecord>;
}

const EMPTY: VoiceUsageRecord = { seconds: 0, requests: 0 };

export class BlobVoiceQuotaStore implements VoiceQuotaStore {
  constructor(private readonly bucket: BlobBucket) {}

  async get(scope: VoiceScope, month: string): Promise<VoiceUsageRecord> {
    return ((await this.bucket.get(keys.voice(scope, month)))?.value as VoiceUsageRecord | undefined) ?? EMPTY;
  }

  async add(scope: VoiceScope, month: string, seconds: number): Promise<VoiceUsageRecord> {
    const result = await casUpdate<VoiceUsageRecord>(this.bucket, keys.voice(scope, month), (current) => ({
      seconds: (current?.seconds ?? 0) + seconds,
      requests: (current?.requests ?? 0) + 1,
    }));
    return result ?? EMPTY;
  }

  async raiseTo(scope: VoiceScope, month: string, usage: VoiceUsageRecord): Promise<VoiceUsageRecord> {
    const result = await casUpdate<VoiceUsageRecord>(this.bucket, keys.voice(scope, month), (current) => {
      const next = {
        seconds: Math.max(current?.seconds ?? 0, usage.seconds),
        requests: Math.max(current?.requests ?? 0, usage.requests),
      };
      return current && current.seconds === next.seconds && current.requests === next.requests ? undefined : next;
    });
    return result ?? EMPTY;
  }
}
