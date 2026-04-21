import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";

import type { ServiceConfig } from "@/types";

const RUNTIME_ENV: Record<string, string | undefined> =
  typeof process !== "undefined" && process.env
    ? (process.env as Record<string, string | undefined>)
    : {};

function readEnv(c: Context, key: string): string | undefined {
  const bindings = c.env as Record<string, string | undefined> | undefined;
  return bindings?.[key] ?? RUNTIME_ENV[key];
}

function requireEnv(c: Context, key: string): string {
  const value = readEnv(c, key);
  if (!value) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: `Missing required environment variable: ${key}`
    });
  }
  return value;
}

export function getServiceConfig(c: Context): ServiceConfig {
  const sessionTtlRaw = readEnv(c, "SESSION_TTL_DAYS") ?? "30";
  const sessionTtlDays = Number(sessionTtlRaw);
  const jwtAccessTtlRaw = readEnv(c, "JWT_ACCESS_TTL_SECONDS") ?? "900";
  const jwtAccessTtlSeconds = Number(jwtAccessTtlRaw);
  const refreshTtlRaw = readEnv(c, "REFRESH_TOKEN_TTL_DAYS") ?? "30";
  const refreshTokenTtlDays = Number(refreshTtlRaw);

  if (!Number.isFinite(sessionTtlDays) || sessionTtlDays <= 0) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: "SESSION_TTL_DAYS must be a positive number"
    });
  }

  if (!Number.isFinite(jwtAccessTtlSeconds) || jwtAccessTtlSeconds <= 0) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: "JWT_ACCESS_TTL_SECONDS must be a positive number"
    });
  }

  if (!Number.isFinite(refreshTokenTtlDays) || refreshTokenTtlDays <= 0) {
    throw new HTTPException(StatusCodes.INTERNAL_SERVER_ERROR, {
      message: "REFRESH_TOKEN_TTL_DAYS must be a positive number"
    });
  }

  const cookieDomain = readEnv(c, "COOKIE_DOMAIN");
  const appBaseUrl = requireEnv(c, "APP_BASE_URL");
  const jwtIssuer = readEnv(c, "JWT_ISSUER") ?? appBaseUrl;
  const jwtAudience = readEnv(c, "JWT_AUDIENCE") ?? "api-service";

  return {
    databaseUrl: requireEnv(c, "DATABASE_URL"),
    appBaseUrl,
    sessionSecret: requireEnv(c, "SESSION_SECRET"),
    sessionTtlDays,
    jwtAccessSecret: requireEnv(c, "JWT_ACCESS_SECRET"),
    jwtAccessTtlSeconds,
    refreshTokenTtlDays,
    jwtIssuer,
    jwtAudience,
    cookieDomain,
    googleClientId: requireEnv(c, "GOOGLE_CLIENT_ID"),
    googleClientSecret: requireEnv(c, "GOOGLE_CLIENT_SECRET"),
    githubClientId: requireEnv(c, "GITHUB_CLIENT_ID"),
    githubClientSecret: requireEnv(c, "GITHUB_CLIENT_SECRET")
  };
}
