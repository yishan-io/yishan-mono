import { casUpdate, deletePrefix, putIfAbsent } from "@/store/blob/cas";
import type { BlobBucket } from "@/store/blob/types";
import { keys } from "@/store/keys";
import type { OrganizationRecord } from "@/store/types";

export interface OrganizationStore {
  get(id: string): Promise<OrganizationRecord | null>;
  create(org: OrganizationRecord): Promise<{ created: boolean; organization: OrganizationRecord }>;
  /** CAS update; `fn` returns the new record or undefined for no change. Null when missing. */
  update(
    id: string,
    fn: (org: OrganizationRecord) => OrganizationRecord | undefined,
  ): Promise<OrganizationRecord | null>;
  delete(id: string): Promise<void>;
  listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]>;
  listOrganizationIdsForUser(userId: string): Promise<string[]>;
  addUserOrganization(userId: string, orgId: string): Promise<void>;
  removeUserOrganization(userId: string, orgId: string): Promise<void>;
  listInvitedOrganizationIds(email: string): Promise<string[]>;
  addInvite(email: string, orgId: string): Promise<void>;
  removeInvite(email: string, orgId: string): Promise<void>;
}

export class BlobOrganizationStore implements OrganizationStore {
  constructor(private readonly bucket: BlobBucket) {}

  async get(id: string): Promise<OrganizationRecord | null> {
    return ((await this.bucket.get(keys.org(id)))?.value as OrganizationRecord | undefined) ?? null;
  }

  async create(org: OrganizationRecord): Promise<{ created: boolean; organization: OrganizationRecord }> {
    const result = await putIfAbsent(this.bucket, keys.org(org.id), org);
    return { created: result.created, organization: result.value };
  }

  update(
    id: string,
    fn: (org: OrganizationRecord) => OrganizationRecord | undefined,
  ): Promise<OrganizationRecord | null> {
    return casUpdate<OrganizationRecord>(this.bucket, keys.org(id), (current) => (current ? fn(current) : undefined));
  }

  async delete(id: string): Promise<void> {
    const org = await this.get(id);
    await this.bucket.delete([keys.org(id)]);
    if (org) {
      // Best-effort: stale index entries are filtered on read anyway.
      await Promise.all([
        ...org.members.map((m) => this.removeUserOrganization(m.userId, id).catch(() => undefined)),
        ...org.invites.map((i) => this.removeInvite(i.email, id).catch(() => undefined)),
      ]);
    }
    await deletePrefix(this.bucket, keys.usagePrefix(id));
    await deletePrefix(this.bucket, keys.voicePrefix(id));
  }

  async listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]> {
    const indexed = await this.readList(keys.userOrgs(userId));
    const orgs = await Promise.all(indexed.map((id) => this.get(id)));
    const valid: OrganizationRecord[] = [];
    const stale: string[] = [];
    indexed.forEach((id, i) => {
      const org = orgs[i];
      if (org?.members.some((m) => m.userId === userId)) {
        valid.push(org);
      } else {
        stale.push(id);
      }
    });
    if (stale.length > 0) {
      await this.mutateList(keys.userOrgs(userId), (ids) => ids.filter((id) => !stale.includes(id))).catch(
        () => undefined,
      );
    }
    return valid;
  }

  async listOrganizationIdsForUser(userId: string): Promise<string[]> {
    return (await this.listOrganizationsForUser(userId)).map((o) => o.id);
  }

  async addUserOrganization(userId: string, orgId: string): Promise<void> {
    await this.mutateList(keys.userOrgs(userId), (ids) => (ids.includes(orgId) ? ids : [...ids, orgId]));
  }

  async removeUserOrganization(userId: string, orgId: string): Promise<void> {
    await this.mutateList(keys.userOrgs(userId), (ids) => ids.filter((id) => id !== orgId));
  }

  async listInvitedOrganizationIds(email: string): Promise<string[]> {
    const indexed = await this.readList(keys.invite(email));
    const normalized = email.trim().toLowerCase();
    const orgs = await Promise.all(indexed.map((id) => this.get(id)));
    const now = Date.now();
    const valid: string[] = [];
    const stale: string[] = [];
    indexed.forEach((id, i) => {
      const hasInvite = orgs[i]?.invites.some(
        (inv) => inv.email.trim().toLowerCase() === normalized && new Date(inv.expiresAt).getTime() > now,
      );
      (hasInvite ? valid : stale).push(id);
    });
    if (stale.length > 0) {
      await this.mutateList(keys.invite(email), (ids) => ids.filter((id) => !stale.includes(id))).catch(
        () => undefined,
      );
    }
    return valid;
  }

  async addInvite(email: string, orgId: string): Promise<void> {
    await this.mutateList(keys.invite(email), (ids) => (ids.includes(orgId) ? ids : [...ids, orgId]));
  }

  async removeInvite(email: string, orgId: string): Promise<void> {
    await this.mutateList(keys.invite(email), (ids) => ids.filter((id) => id !== orgId));
  }

  private async readList(key: string): Promise<string[]> {
    return ((await this.bucket.get(key))?.value as string[] | undefined) ?? [];
  }

  private async mutateList(key: string, fn: (ids: string[]) => string[]): Promise<void> {
    await casUpdate<string[]>(this.bucket, key, (current) => {
      if (!current) {
        const next = fn([]);
        return next.length > 0 ? next : undefined;
      }
      const next = fn(current);
      return next.length === current.length ? undefined : next;
    });
  }
}
