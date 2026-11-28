import { casUpdate, deletePrefix } from "@/store/blob/cas";
import type { BlobBucket } from "@/store/blob/types";
import { keys } from "@/store/keys";
import { mergeRows } from "@/store/token-usage-merge";
import type { TokenUsageDayRecord, TokenUsageHourlyRow } from "@/store/types";

export interface TokenUsageStore {
  get(orgId: string, userId: string, day: string): Promise<TokenUsageDayRecord | null>;
  /** Merges rows into the (org, user, day) object using max-wins rules. `day` is yyyy-mm-dd (UTC). */
  mergeRows(orgId: string, userId: string, day: string, rows: TokenUsageHourlyRow[]): Promise<TokenUsageDayRecord>;
  deleteOrganization(orgId: string): Promise<void>;
}

export class BlobTokenUsageStore implements TokenUsageStore {
  constructor(private readonly bucket: BlobBucket) {}

  async get(orgId: string, userId: string, day: string): Promise<TokenUsageDayRecord | null> {
    return ((await this.bucket.get(keys.usage(orgId, day, userId)))?.value as TokenUsageDayRecord | undefined) ?? null;
  }

  async mergeRows(
    orgId: string,
    userId: string,
    day: string,
    rows: TokenUsageHourlyRow[],
  ): Promise<TokenUsageDayRecord> {
    const result = await casUpdate<TokenUsageDayRecord>(this.bucket, keys.usage(orgId, day, userId), (current) => {
      const merged = mergeRows(current?.rows ?? [], rows);
      const unchanged = current && JSON.stringify(current.rows) === JSON.stringify(merged);
      return unchanged ? undefined : { rows: merged };
    });
    return result ?? { rows: [] };
  }

  deleteOrganization(orgId: string): Promise<void> {
    return deletePrefix(this.bucket, keys.usagePrefix(orgId));
  }
}
