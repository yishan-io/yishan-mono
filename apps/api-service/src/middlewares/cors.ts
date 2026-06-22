import type { Context } from "hono";
import { cors } from "hono/cors";

/** Origins allowed in development when no CORS_ORIGINS env var is set. */
const DEFAULT_DEV_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"] as const;

/**
 * Cache of already-computed allowed-origins sets, keyed by the raw CORS_ORIGINS
 * string (or "" for the dev default). This avoids re-parsing on every request
 * when the env var does not change between requests.
 */
const allowedOriginsCache = new Map<string, Set<string>>();

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readEnv(c: Context, key: string): string | undefined {
  const bindings = c.env as Record<string, string | undefined> | undefined;
  const runtimeEnv =
    typeof process !== "undefined" && process.env ? (process.env as Record<string, string | undefined>) : {};
  return bindings?.[key] ?? runtimeEnv[key];
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isEquivalentLoopbackOrigin(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      leftUrl.protocol === rightUrl.protocol &&
      leftUrl.port === rightUrl.port &&
      isLoopbackHost(leftUrl.hostname) &&
      isLoopbackHost(rightUrl.hostname)
    );
  } catch {
    return false;
  }
}

function buildAllowedOriginsFromRaw(corsOriginsRaw: string): Set<string> {
  const allowedOrigins = new Set<string>();
  for (const entry of corsOriginsRaw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed === "*") {
      allowedOrigins.add("*");
      continue;
    }
    const normalized = normalizeOrigin(trimmed);
    if (normalized) allowedOrigins.add(normalized);
  }
  return allowedOrigins;
}

function getAllowedOrigins(c: Context): Set<string> {
  const corsOriginsRaw = readEnv(c, "CORS_ORIGINS");

  if (corsOriginsRaw) {
    const cached = allowedOriginsCache.get(corsOriginsRaw);
    if (cached) return cached;

    const set = buildAllowedOriginsFromRaw(corsOriginsRaw);
    allowedOriginsCache.set(corsOriginsRaw, set);
    return set;
  }

  const appBaseUrl = readEnv(c, "APP_BASE_URL") ?? "";
  const cacheKey = `__dev__:${appBaseUrl}`;
  const cached = allowedOriginsCache.get(cacheKey);
  if (cached) return cached;

  const allowedOrigins = new Set<string>(DEFAULT_DEV_ORIGINS);
  const normalized = normalizeOrigin(appBaseUrl);
  if (normalized) allowedOrigins.add(normalized);
  allowedOriginsCache.set(cacheKey, allowedOrigins);
  return allowedOrigins;
}

export const corsMiddleware = cors({
  origin: (origin, c) => {
    if (!origin) {
      return "";
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) {
      return "";
    }

    const allowedOrigins = getAllowedOrigins(c);

    if (allowedOrigins.has("*")) {
      return normalizedOrigin;
    }

    if (allowedOrigins.has(normalizedOrigin)) {
      return normalizedOrigin;
    }

    for (const allowedOrigin of allowedOrigins) {
      if (isEquivalentLoopbackOrigin(allowedOrigin, normalizedOrigin)) {
        return normalizedOrigin;
      }
    }

    return "";
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
});
