import { ApiError } from "@/lib/api/errors";
import { getApiBaseUrl } from "@/lib/config/env";
import type { StoredSession } from "@/lib/storage/session-storage";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  accessToken?: string | null;
  body?: unknown;
  skipAuthRefresh?: boolean;
};

type ErrorResponse = {
  error?: string;
  code?: string;
  [key: string]: unknown;
};

type ApiAuthHandlers = {
  getSession: () => StoredSession | null;
  refreshSession: (refreshToken: string) => Promise<StoredSession>;
  commitSession: (session: StoredSession | null) => Promise<void>;
};

let apiAuthHandlers: ApiAuthHandlers | null = null;
let refreshInFlight: Promise<StoredSession> | null = null;
const REQUEST_TIMEOUT_MS = 15_000;

/** Owns mobile HTTP defaults, auth refresh retry, and response/error decoding. */
export function configureApiAuthHandlers(handlers: ApiAuthHandlers | null) {
  apiAuthHandlers = handlers;
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Request timed out", 0, "request_timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isTerminalRefreshError(error: unknown): boolean {
  return error instanceof ApiError && [400, 401, 403].includes(error.status);
}

async function refreshAuthenticatedSession(): Promise<StoredSession | null> {
  const handlers = apiAuthHandlers;

  if (!handlers) {
    return null;
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  const currentSession = handlers.getSession();
  if (!currentSession?.refreshToken) {
    return null;
  }

  refreshInFlight = (async () => {
    try {
      const nextSession = await handlers.refreshSession(currentSession.refreshToken);
      await handlers.commitSession(nextSession);
      return nextSession;
    } catch (error) {
      if (isTerminalRefreshError(error)) {
        await handlers.commitSession(null);
      }

      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function clearAuthenticatedSession(): Promise<void> {
  if (!apiAuthHandlers) {
    return;
  }

  await apiAuthHandlers.commitSession(null);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const attemptedToken = options.accessToken ?? apiAuthHandlers?.getSession()?.accessToken ?? null;
  const response = await fetchWithTimeout(new URL(path, getApiBaseUrl()).toString(), {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(attemptedToken ? { Authorization: `Bearer ${attemptedToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && !options.skipAuthRefresh) {
    const refreshedSession = await refreshAuthenticatedSession();

    if (refreshedSession?.accessToken) {
      return apiRequest<T>(path, {
        ...options,
        accessToken: refreshedSession.accessToken,
        skipAuthRefresh: true,
      });
    }

    await clearAuthenticatedSession();
  }

  if (!response.ok) {
    let payload: ErrorResponse | null = null;

    try {
      payload = (await response.json()) as ErrorResponse;
    } catch {
      payload = null;
    }

    throw new ApiError(
      payload?.error ?? `HTTP ${response.status}`,
      response.status,
      typeof payload?.code === "string" ? payload.code : "request_failed",
      payload ?? undefined,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
