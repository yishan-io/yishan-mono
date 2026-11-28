import { casUpdate, putIfAbsent } from "@/store/blob/cas";
import type { BlobBucket } from "@/store/blob/types";
import { keys } from "@/store/keys";
import type { UserRecord } from "@/store/types";

export interface UserStore {
  get(id: string): Promise<UserRecord | null>;
  createIfAbsent(user: UserRecord): Promise<{ created: boolean; user: UserRecord }>;
  /** CAS update; `fn` returns the new record or undefined for no change. Null when the user does not exist. */
  update(id: string, fn: (user: UserRecord) => UserRecord | undefined): Promise<UserRecord | null>;
  /** Returns the winning default organization id (null when the user does not exist). */
  setDefaultOrganizationIfUnset(id: string, orgId: string): Promise<string | null>;
}

export class BlobUserStore implements UserStore {
  constructor(private readonly bucket: BlobBucket) {}

  async get(id: string): Promise<UserRecord | null> {
    return ((await this.bucket.get(keys.user(id)))?.value as UserRecord | undefined) ?? null;
  }

  async createIfAbsent(user: UserRecord): Promise<{ created: boolean; user: UserRecord }> {
    const result = await putIfAbsent(this.bucket, keys.user(user.id), user);
    return { created: result.created, user: result.value };
  }

  update(id: string, fn: (user: UserRecord) => UserRecord | undefined): Promise<UserRecord | null> {
    return casUpdate<UserRecord>(this.bucket, keys.user(id), (current) => (current ? fn(current) : undefined));
  }

  async setDefaultOrganizationIfUnset(id: string, orgId: string): Promise<string | null> {
    const user = await this.update(id, (current) =>
      current.defaultOrganizationId
        ? undefined
        : { ...current, defaultOrganizationId: orgId, updatedAt: new Date().toISOString() },
    );
    return user?.defaultOrganizationId ?? null;
  }
}
