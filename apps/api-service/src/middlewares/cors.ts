import type { Context } from "hono";
import { cors } from "hono/cors";

/** Origins allowed in development when no CORS_ORIGINS env var is set. */
const DEFAULT_DEV_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"] as const;

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

function getAllowedOrigins(c: Context): Set<string> {
  const allowedOrigins = new Set<string>();

  const corsOriginsRaw = readEnv(c, "CORS_ORIGINS");
  if (corsOriginsRaw) {
    for (const entry of corsOriginsRaw.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed === "*") {
        allowedOrigins.add("*");
        continue;
      }

      const normalized = normalizeOrigin(trimmed);
      if (normalized) {
        allowedOrigins.add(normalized);
      }
    }

    return allowedOrigins;
  }

  for (const origin of DEFAULT_DEV_ORIGINS) {
    allowedOrigins.add(origin);
  }

  const appBaseUrl = readEnv(c, "APP_BASE_URL");
  if (appBaseUrl) {
    const normalized = normalizeOrigin(appBaseUrl);
    if (normalized) {
      allowedOrigins.add(normalized);
    }
  }

  return allowedOrigins;
}

export const corsMiddleware = cors({
  origin: (origin, c) => {
    if (!origin) {
      return "";
    }

    const allowedOrigins = getAllowedOrigins(c);

    if (allowedOrigins.has("*")) {
      return origin;
    }

    if (allowedOrigins.has(origin)) {
      return origin;
    }

    return "";
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
});
