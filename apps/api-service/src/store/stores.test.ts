import { createStores } from "@/store";
import { MemoryBlobBucket } from "@/store/blob/memory-bucket";
import type {
  OrganizationRecord,
  RefreshTokenRecord,
  SessionRecord,
  TokenUsageHourlyRow,
  UserRecord,
} from "@/store/types";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-11-28T00:00:00Z");
const PAST = "2026-11-01T00:00:00.000Z";
const FUTURE = "2026-12-28T00:00:00.000Z";

function setup() {
  const bucket = new MemoryBlobBucket();
  return { bucket, stores: createStores(bucket, { now: () => NOW }) };
}

function user(id: string): UserRecord {
  return { id, email: `${id}@x.io`, name: id, avatarUrl: null, createdAt: PAST, updatedAt: PAST };
}

function org(id: string, memberIds: string[]): OrganizationRecord {
  return {
    id,
    name: id,
    plan: "pro",
    createdByUserId: memberIds[0] ?? "u",
    createdAt: PAST,
    updatedAt: PAST,
    members: memberIds.map((userId) => ({
      userId,
      role: "member",
      name: userId,
      email: `${userId}@x.io`,
      avatarUrl: null,
      joinedAt: PAST,
    })),
    invites: [],
  };
}

describe("UserStore / IdentityIndexStore", () => {
  it("createIfAbsent keeps the first writer", async () => {
    const { stores } = setup();
    const [a, b] = await Promise.all([
      stores.users.createIfAbsent(user("u1")),
      stores.users.createIfAbsent({ ...user("u1"), name: "other" }),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.user).toEqual(b.user);
  });

  it("setDefaultOrganizationIfUnset returns the winner", async () => {
    const { stores } = setup();
    await stores.users.createIfAbsent(user("u1"));
    expect(await stores.users.setDefaultOrganizationIfUnset("u1", "o1")).toBe("o1");
    expect(await stores.users.setDefaultOrganizationIfUnset("u1", "o2")).toBe("o1");
    expect(await stores.users.setDefaultOrganizationIfUnset("nope", "o2")).toBeNull();
  });

  it("normalizes emails and keeps the first link", async () => {
    const { stores } = setup();
    expect(await stores.identities.linkEmailIfAbsent("  Foo@X.io ", "u1")).toBe("u1");
    expect(await stores.identities.linkEmailIfAbsent("foo@x.io", "u2")).toBe("u1");
    expect(await stores.identities.getUserIdByEmail("FOO@x.io")).toBe("u1");
    expect(await stores.identities.linkOAuthIfAbsent("google", "g/1", "u1")).toBe("u1");
    expect(await stores.identities.getUserIdByOAuth("google", "g/1")).toBe("u1");
    expect(await stores.identities.getUserIdByOAuth("github", "g/1")).toBeNull();
  });
});

describe("AuthTokenStore", () => {
  const session = (tokenHash: string, expiresAt: string): SessionRecord => ({
    id: tokenHash,
    userId: "u1",
    tokenHash,
    expiresAt,
    createdAt: PAST,
  });
  const refresh = (tokenHash: string, expiresAt: string): RefreshTokenRecord => ({
    ...session(tokenHash, expiresAt),
    revokedAt: null,
    replacedByTokenId: null,
  });

  it("rejects expired sessions and deletes", async () => {
    const { stores } = setup();
    await stores.authTokens.createSession(session("live", FUTURE));
    await stores.authTokens.createSession(session("dead", PAST));
    expect(await stores.authTokens.getSession("live")).not.toBeNull();
    expect(await stores.authTokens.getSession("dead")).toBeNull();
    await stores.authTokens.deleteSession("live");
    expect(await stores.authTokens.getSession("live")).toBeNull();
  });

  it("rejects expired and revoked refresh tokens", async () => {
    const { stores } = setup();
    await stores.authTokens.createRefresh(refresh("live", FUTURE));
    await stores.authTokens.createRefresh(refresh("dead", PAST));
    expect(await stores.authTokens.getRefresh("live")).not.toBeNull();
    expect(await stores.authTokens.getRefresh("dead")).toBeNull();
    const revoked = await stores.authTokens.revokeRefresh("live", "next");
    expect(revoked?.replacedByTokenId).toBe("next");
    expect(await stores.authTokens.getRefresh("live")).toBeNull();
  });
});

describe("OrganizationStore", () => {
  it("create is put-if-absent", async () => {
    const { stores } = setup();
    expect((await stores.organizations.create(org("o1", ["u1"]))).created).toBe(true);
    const second = await stores.organizations.create({ ...org("o1", ["u1"]), name: "dup" });
    expect(second.created).toBe(false);
    expect(second.organization.name).toBe("o1");
  });

  it("filters and cleans stale user->org index entries", async () => {
    const { stores, bucket } = setup();
    await stores.organizations.create(org("good", ["u1"]));
    await stores.organizations.create(org("removed", ["u2"]));
    for (const id of ["good", "removed", "gone"]) {
      await stores.organizations.addUserOrganization("u1", id);
    }
    expect(await stores.organizations.listOrganizationIdsForUser("u1")).toEqual(["good"]);
    expect((await bucket.get("users/u1/orgs.json"))?.value).toEqual(["good"]);
  });

  it("delete removes the object, member indexes and usage/voice prefixes", async () => {
    const { stores, bucket } = setup();
    await stores.organizations.create(org("o1", ["u1", "u2"]));
    await stores.organizations.create(org("o2", ["u1"]));
    for (const u of ["u1", "u2"]) {
      await stores.organizations.addUserOrganization(u, "o1");
    }
    await stores.organizations.addUserOrganization("u1", "o2");
    await stores.voiceQuota.add({ orgId: "o1" }, "2026-11", 5);
    await stores.voiceQuota.add({ orgId: "o1", userId: "u1" }, "2026-11", 5);
    await bucket.put("usage/o1/2026-11-01/u1.json", { rows: [] });
    await bucket.put("usage/o10/2026-11-01/u1.json", { rows: [] });

    await stores.organizations.delete("o1");

    expect(await stores.organizations.get("o1")).toBeNull();
    expect((await bucket.get("users/u1/orgs.json"))?.value).toEqual(["o2"]);
    expect((await bucket.get("users/u2/orgs.json"))?.value).toEqual([]);
    expect(bucket.keys().filter((k) => k.startsWith("usage/o1/") || k.startsWith("voice/o1/"))).toEqual([]);
    expect(bucket.keys()).toContain("usage/o10/2026-11-01/u1.json");
  });

  it("tracks invites and drops stale ones", async () => {
    const { stores } = setup();
    const o = org("o1", ["u1"]);
    o.invites.push({
      id: "i1",
      email: "New@X.io",
      role: "member",
      invitedByUserId: "u1",
      createdAt: PAST,
      expiresAt: FUTURE,
    });
    await stores.organizations.create(o);
    await stores.organizations.addInvite("new@x.io", "o1");
    await stores.organizations.addInvite("new@x.io", "ghost");
    expect(await stores.organizations.listInvitedOrganizationIds(" NEW@x.io")).toEqual(["o1"]);
    await stores.organizations.removeInvite("new@x.io", "o1");
    expect(await stores.organizations.listInvitedOrganizationIds("new@x.io")).toEqual([]);
  });
});

describe("VoiceQuotaStore", () => {
  it("accumulates per scope independently", async () => {
    const { stores } = setup();
    await stores.voiceQuota.add({ orgId: "o1" }, "2026-11", 10);
    await stores.voiceQuota.add({ orgId: "o1" }, "2026-11", 5);
    await stores.voiceQuota.add({ orgId: "o1", userId: "u1" }, "2026-11", 7);
    expect(await stores.voiceQuota.get({ orgId: "o1" }, "2026-11")).toEqual({ seconds: 15, requests: 2 });
    expect(await stores.voiceQuota.get({ orgId: "o1", userId: "u1" }, "2026-11")).toEqual({ seconds: 7, requests: 1 });
    expect(await stores.voiceQuota.get({ orgId: "o1", userId: "u2" }, "2026-11")).toEqual({ seconds: 0, requests: 0 });
  });

  it("raiseTo keeps the max", async () => {
    const { stores } = setup();
    await stores.voiceQuota.add({ orgId: "o1" }, "2026-11", 50);
    const raised = await stores.voiceQuota.raiseTo({ orgId: "o1" }, "2026-11", { seconds: 20, requests: 9 });
    expect(raised).toEqual({ seconds: 50, requests: 9 });
  });
});

describe("TokenUsageStore", () => {
  const usageRow: TokenUsageHourlyRow = {
    projectId: "p",
    workspaceId: "w",
    workspacePath: "/",
    agentKind: "claude",
    model: "m",
    modelNormalized: "m",
    bucketStartHourUtc: PAST,
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    cachedWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 2,
    totalCostMicrosUsd: 0,
    costSource: "unknown",
    eventCount: 1,
    sessionCount: 1,
    turnCount: 1,
    toolCallCount: 0,
    attributionConfidence: "exact",
    ingestedAt: PAST,
    runId: "r",
  };

  it("merges idempotently and deleteOrganization removes only that org", async () => {
    const { stores, bucket } = setup();
    await stores.tokenUsage.mergeRows("o1", "u1", "2026-11-01", [usageRow]);
    await stores.tokenUsage.mergeRows("o1", "u1", "2026-11-01", [usageRow]);
    expect((await stores.tokenUsage.get("o1", "u1", "2026-11-01"))?.rows).toHaveLength(1);
    await stores.tokenUsage.mergeRows("o1", "u2", "2026-11-02", [usageRow]);
    await stores.tokenUsage.mergeRows("o2", "u1", "2026-11-01", [usageRow]);
    await stores.tokenUsage.deleteOrganization("o1");
    expect(bucket.keys()).toEqual(["usage/o2/2026-11-01/u1.json"]);
  });
});
