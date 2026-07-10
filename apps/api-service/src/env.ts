import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";

import type { ServiceConfig } from "@/types";

/** Default JWT audience when JWT_AUDIENCE env var is not set. */
const DEFAULT_JWT_AUDIENCE = "api-service";

const RUNTIME_ENV: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env ? (process.env as Record<string, string | undefined>) : {};

/**
 * Module-scope cache for parsed service configs.
 *
 * Keyed by the raw bindings object (`c.env`).  On Cloudflare Workers the same
 * bindings object is reused for every request in a given Worker isolation, so
 * the cache avoids re-parsing and re-validating up to 14 env vars per request.
 * On Node.js each request still uses `process.env`, which is also a single
 * stable reference, so caching works there too.
 *
 * WeakMap ensures the entry is GC'd if the env object is ever dropped.
 */
const serviceConfigCache = new WeakMap<object, ServiceConfig>();

function readEnv(c: Context, key: string): string | undefined {
  const bindings = c.env as Record<string, string | undefined> | undefined;
  return bindings?.[key] ?? RUNTIME_ENV[key];
}

function readHyperdriveConnectionString(c: Context): string | undefined {
  const bindings = c.env as { HYPERDRIVE?: { connectionString?: string } } | undefined;
  return bindings?.HYPERDRIVE?.connectionString;
}

export function hasHyperdriveBinding(c: Context): boolean {
  const bindings = c.env as { HYPERDRIVE?: unknown } | undefined;
  return Boolean(bindings?.HYPERDRIVE);
}

function requireEnv(c: Context, key: string): string {
  const value = readEnv(c, key);
  if (!value) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: `Missing required environment variable: ${key}`,
    });
  }
  return value;
}

function readOptionalEnv(c: Context, key: string): string | undefined {
  const value = readEnv(c, key)?.trim();
  return value ? value : undefined;
}

function buildServiceConfig(c: Context): ServiceConfig {
  const sessionTtlRaw = readEnv(c, "SESSION_TTL_DAYS") ?? "30";
  const sessionTtlDays = Number(sessionTtlRaw);
  const jwtAccessTtlRaw = readEnv(c, "JWT_ACCESS_TTL_SECONDS") ?? "900";
  const jwtAccessTtlSeconds = Number(jwtAccessTtlRaw);
  const refreshTtlRaw = readEnv(c, "REFRESH_TOKEN_TTL_DAYS") ?? "30";
  const refreshTokenTtlDays = Number(refreshTtlRaw);

  if (!Number.isFinite(sessionTtlDays) || sessionTtlDays <= 0) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: "SESSION_TTL_DAYS must be a positive number",
    });
  }

  if (!Number.isFinite(jwtAccessTtlSeconds) || jwtAccessTtlSeconds <= 0) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: "JWT_ACCESS_TTL_SECONDS must be a positive number",
    });
  }

  if (!Number.isFinite(refreshTokenTtlDays) || refreshTokenTtlDays <= 0) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: "REFRESH_TOKEN_TTL_DAYS must be a positive number",
    });
  }

  const cookieDomain = readOptionalEnv(c, "COOKIE_DOMAIN");
  const appBaseUrl = requireEnv(c, "APP_BASE_URL");
  const landingBaseUrl = readOptionalEnv(c, "LANDING_BASE_URL") ?? "https://yishan.io";
  const jwtIssuer = readOptionalEnv(c, "JWT_ISSUER") ?? appBaseUrl;
  const jwtAudience = readOptionalEnv(c, "JWT_AUDIENCE") ?? DEFAULT_JWT_AUDIENCE;

  return {
    databaseUrl: readHyperdriveConnectionString(c) ?? requireEnv(c, "DATABASE_URL"),
    appBaseUrl,
    landingBaseUrl,
    relayUrl: readOptionalEnv(c, "RELAY_URL"),
    relayApiToken: readOptionalEnv(c, "RELAY_API_TOKEN"),
    sessionSecret: requireEnv(c, "SESSION_SECRET"),
    sessionTtlDays,
    jwtAccessSecret: requireEnv(c, "JWT_ACCESS_SECRET"),
    jwtAccessTtlSeconds,
    refreshTokenTtlDays,
    jwtIssuer,
    jwtAudience,
    cookieDomain,
    googleClientId: requireEnv(c, "GOOGLE_CLIENT_ID"),
    googleClientIdIos: readOptionalEnv(c, "GOOGLE_CLIENT_ID_IOS"),
    googleClientIdAndroid: readOptionalEnv(c, "GOOGLE_CLIENT_ID_ANDROID"),
    googleClientSecret: requireEnv(c, "GOOGLE_CLIENT_SECRET"),
    githubClientId: requireEnv(c, "GITHUB_CLIENT_ID"),
    githubClientSecret: requireEnv(c, "GITHUB_CLIENT_SECRET"),
    resendApiKey: requireEnv(c, "RESEND_API_KEY"),
    resendFromEmail: requireEnv(c, "RESEND_FROM_EMAIL"),
    openrouterApiKey: requireEnv(c, "OPENROUTER_API_KEY"),
  };
}

export function getServiceConfig(c: Context): ServiceConfig {
  // Use the env bindings object (or process.env as fallback) as the cache key.
  // Both are stable references within a Worker isolation / Node.js process.
  const envKey = (c.env as object | undefined) ?? RUNTIME_ENV;
  const cached = serviceConfigCache.get(envKey);
  if (cached) {
    return cached;
  }

  const config = buildServiceConfig(c);
  serviceConfigCache.set(envKey, config);
  return config;
}
