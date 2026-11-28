import { casUpdate, putIfAbsent } from "@/store/blob/cas";
import type { BlobBucket } from "@/store/blob/types";
import { keys } from "@/store/keys";
import type { RefreshTokenRecord, SessionRecord } from "@/store/types";

export interface AuthTokenStore {
  createSession(record: SessionRecord): Promise<SessionRecord>;
  /** Null when missing or expired. */
  getSession(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  createRefresh(record: RefreshTokenRecord): Promise<RefreshTokenRecord>;
  /** Null when missing, expired or revoked. */
  getRefresh(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Marks the token revoked (idempotent). Null when missing. */
  revokeRefresh(tokenHash: string, replacedByTokenId?: string): Promise<RefreshTokenRecord | null>;
}

export class BlobAuthTokenStore implements AuthTokenStore {
  constructor(
    private readonly bucket: BlobBucket,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private isExpired(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() <= this.now().getTime();
  }

  async createSession(record: SessionRecord): Promise<SessionRecord> {
    return (await putIfAbsent(this.bucket, keys.session(record.tokenHash), record)).value;
  }

  async getSession(tokenHash: string): Promise<SessionRecord | null> {
    const record = (await this.bucket.get(keys.session(tokenHash)))?.value as SessionRecord | undefined;
    return record && !this.isExpired(record.expiresAt) ? record : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.bucket.delete([keys.session(tokenHash)]);
  }

  async createRefresh(record: RefreshTokenRecord): Promise<RefreshTokenRecord> {
    return (await putIfAbsent(this.bucket, keys.refresh(record.tokenHash), record)).value;
  }

  async getRefresh(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const record = (await this.bucket.get(keys.refresh(tokenHash)))?.value as RefreshTokenRecord | undefined;
    return record && !record.revokedAt && !this.isExpired(record.expiresAt) ? record : null;
  }

  revokeRefresh(tokenHash: string, replacedByTokenId?: string): Promise<RefreshTokenRecord | null> {
    return casUpdate<RefreshTokenRecord>(this.bucket, keys.refresh(tokenHash), (current) => {
      if (!current || current.revokedAt) {
        return undefined;
      }
      return {
        ...current,
        revokedAt: this.now().toISOString(),
        replacedByTokenId: replacedByTokenId ?? current.replacedByTokenId,
      };
    });
  }
}
