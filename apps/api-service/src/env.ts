import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { ServiceConfig } from "./types";

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
    throw new HTTPException(500, {
      message: `Missing required environment variable: ${key}`
    });
  }
  return value;
}

export function getServiceConfig(c: Context): ServiceConfig {
  const sessionTtlRaw = readEnv(c, "SESSION_TTL_DAYS") ?? "30";
  const sessionTtlDays = Number(sessionTtlRaw);

  if (!Number.isFinite(sessionTtlDays) || sessionTtlDays <= 0) {
    throw new HTTPException(500, {
      message: "SESSION_TTL_DAYS must be a positive number"
    });
  }

  const cookieDomain = readEnv(c, "COOKIE_DOMAIN");

  return {
    databaseUrl: requireEnv(c, "DATABASE_URL"),
    appBaseUrl: requireEnv(c, "APP_BASE_URL"),
    sessionSecret: requireEnv(c, "SESSION_SECRET"),
    sessionTtlDays,
    cookieDomain,
    googleClientId: requireEnv(c, "GOOGLE_CLIENT_ID"),
    googleClientSecret: requireEnv(c, "GOOGLE_CLIENT_SECRET"),
    githubClientId: requireEnv(c, "GITHUB_CLIENT_ID"),
    githubClientSecret: requireEnv(c, "GITHUB_CLIENT_SECRET")
  };
}
