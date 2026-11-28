import { type AuthTokenStore, BlobAuthTokenStore } from "@/store/auth-token-store";
import type { BlobBucket } from "@/store/blob/types";
import { BlobIdentityIndexStore, type IdentityIndexStore } from "@/store/identity-index-store";
import { BlobOrganizationStore, type OrganizationStore } from "@/store/organization-store";
import { BlobTokenUsageStore, type TokenUsageStore } from "@/store/token-usage-store";
import { BlobUserStore, type UserStore } from "@/store/user-store";
import { BlobVoiceQuotaStore, type VoiceQuotaStore } from "@/store/voice-quota-store";

export type Stores = {
  users: UserStore;
  identities: IdentityIndexStore;
  authTokens: AuthTokenStore;
  organizations: OrganizationStore;
  voiceQuota: VoiceQuotaStore;
  tokenUsage: TokenUsageStore;
};

export function createStores(bucket: BlobBucket, options: { now?: () => Date } = {}): Stores {
  return {
    users: new BlobUserStore(bucket),
    identities: new BlobIdentityIndexStore(bucket),
    authTokens: new BlobAuthTokenStore(bucket, options.now),
    organizations: new BlobOrganizationStore(bucket),
    voiceQuota: new BlobVoiceQuotaStore(bucket),
    tokenUsage: new BlobTokenUsageStore(bucket),
  };
}

export * from "@/store/blob/cas";
export { MemoryBlobBucket } from "@/store/blob/memory-bucket";
export { R2BlobBucket } from "@/store/blob/r2-bucket";
export type { BlobBucket } from "@/store/blob/types";
export * from "@/store/types";
