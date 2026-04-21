import { cors } from "hono/cors";
import type { Context } from "hono";

function readEnv(c: Context, key: string): string | undefined {
  const bindings = c.env as Record<string, string | undefined> | undefined;
  const runtimeEnv =
    typeof process !== "undefined" && process.env
      ? (process.env as Record<string, string | undefined>)
      : {};
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
  }

  const appBaseUrl = readEnv(c, "APP_BASE_URL");
  if (appBaseUrl) {
    const normalized = normalizeOrigin(appBaseUrl);
    if (normalized) {
      allowedOrigins.add(normalized);
    }
  }

  if (allowedOrigins.size === 0) {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://localhost:5173");
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
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400
});
