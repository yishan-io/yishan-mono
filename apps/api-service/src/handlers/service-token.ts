import type { AppContext } from "@/hono";
import type { CreateServiceTokenBodyInput, ServiceTokenParamsInput } from "@/validation/service-token";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function createServiceTokenHandler(c: AppContext, body: CreateServiceTokenBodyInput) {
  const actorUser = c.get("sessionUser");
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * MS_PER_DAY)
    : undefined;

  const result = await c.get("services").serviceToken.create({
    actorUserId: actorUser.id,
    name: body.name,
    expiresAt,
  });

  return c.json({
    serviceToken: {
      id: result.id,
      token: result.token,
      tokenPrefix: result.tokenPrefix,
      name: result.name,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      createdAt: result.createdAt.toISOString(),
    },
  });
}

export async function listServiceTokensHandler(c: AppContext) {
  const actorUser = c.get("sessionUser");
  const tokens = await c.get("services").serviceToken.list(actorUser.id);

  return c.json({
    serviceTokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      scopes: t.scopes,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      revokedAt: t.revokedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

export async function revokeServiceTokenHandler(c: AppContext, params: ServiceTokenParamsInput) {
  const actorUser = c.get("sessionUser");
  await c.get("services").serviceToken.revoke(actorUser.id, params.tokenId);
  return c.json({ ok: true });
}
