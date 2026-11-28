import { putIfAbsent } from "@/store/blob/cas";
import type { BlobBucket } from "@/store/blob/types";
import { keys } from "@/store/keys";

type IndexValue = { userId: string };

export interface IdentityIndexStore {
  getUserIdByOAuth(provider: string, providerUserId: string): Promise<string | null>;
  /** Returns the winning userId. */
  linkOAuthIfAbsent(provider: string, providerUserId: string, userId: string): Promise<string>;
  getUserIdByEmail(email: string): Promise<string | null>;
  /** Returns the winning userId. */
  linkEmailIfAbsent(email: string, userId: string): Promise<string>;
}

export class BlobIdentityIndexStore implements IdentityIndexStore {
  constructor(private readonly bucket: BlobBucket) {}

  private async read(key: string): Promise<string | null> {
    return ((await this.bucket.get(key))?.value as IndexValue | undefined)?.userId ?? null;
  }

  private async link(key: string, userId: string): Promise<string> {
    return (await putIfAbsent<IndexValue>(this.bucket, key, { userId })).value.userId;
  }

  getUserIdByOAuth(provider: string, providerUserId: string): Promise<string | null> {
    return this.read(keys.oauth(provider, providerUserId));
  }

  linkOAuthIfAbsent(provider: string, providerUserId: string, userId: string): Promise<string> {
    return this.link(keys.oauth(provider, providerUserId), userId);
  }

  getUserIdByEmail(email: string): Promise<string | null> {
    return this.read(keys.email(email));
  }

  linkEmailIfAbsent(email: string, userId: string): Promise<string> {
    return this.link(keys.email(email), userId);
  }
}
