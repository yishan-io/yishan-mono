import { getDaemonClient } from "../rpc/rpcTransport";

export const DEFAULT_REMOTE_API_BASE_URL = "https://api.yishan.io";
export const DEFAULT_DEV_REMOTE_API_BASE_URL = "http://localhost:8787";

// ---------------------------------------------------------------------------
// Auth-expired event bus
// ---------------------------------------------------------------------------

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

export function onAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

let authExpiredEmitted = false;

function emitAuthExpired(): void {
  if (authExpiredEmitted) {
    return;
  }
  authExpiredEmitted = true;

  for (const listener of authExpiredListeners) {
    try {
      listener();
    } catch {
      // best-effort delivery; do not block remaining listeners
    }
  }
}

export function resetAuthExpiredState(): void {
  authExpiredEmitted = false;
}

// ---------------------------------------------------------------------------
// Token resolution via daemon RPC
// ---------------------------------------------------------------------------

async function resolveAccessToken(): Promise<string | undefined> {
  try {
    const daemonClient = await getDaemonClient();
    const result = await daemonClient.app.getAccessToken();
    return result?.accessToken || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return import.meta.env.DEV ? DEFAULT_DEV_REMOTE_API_BASE_URL : DEFAULT_REMOTE_API_BASE_URL;
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

export async function getApiAccessToken(): Promise<string | undefined> {
  return resolveAccessToken();
}

export async function readRestErrorMessage(response: Response): Promise<string> {
  return readErrorMessage(response);
}

export class RestApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RestApiError";
    this.status = status;
  }
}

function buildHeaders(
  accessToken: string | undefined,
  hasBody: boolean,
  contentType: "json" | "form" = "json",
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody && contentType === "json") {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function executeFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown | undefined,
  contentType: "json" | "form" = "json",
): Promise<Response> {
  return fetch(url, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    credentials: "include",
    body: body === undefined || contentType === "form" ? (body as BodyInit | undefined) : JSON.stringify(body),
  });
}

async function readErrorMessage(response: Response): Promise<string> {
  let message = `Request failed with status ${response.status}`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error?.trim()) {
      message = payload.error;
    }
  } catch {
    // ignore parse errors and keep fallback message
  }
  return message;
}

export async function requestJson<T>(
  path: string,
  input?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  },
): Promise<T> {
  const accessToken = await resolveAccessToken();
  const baseUrl = resolveApiBaseUrl();
  const url = new URL(path, baseUrl).toString();
  const method = input?.method ?? "GET";
  const hasBody = input?.body !== undefined;
  const headers = buildHeaders(accessToken, hasBody);

  const response = await executeFetch(url, method, headers, input?.body);

  if (response.status === 401) {
    try {
      const daemonClient = await getDaemonClient();
      const status = await daemonClient.app.checkAuthStatus();
      if (status.authenticated) {
        const retryToken = await daemonClient.app.getAccessToken();
        if (retryToken?.accessToken) {
          const retryHeaders = buildHeaders(retryToken.accessToken, hasBody);
          const retryResponse = await executeFetch(url, method, retryHeaders, input?.body);

          if (!retryResponse.ok) {
            const message = await readErrorMessage(retryResponse);
            throw new RestApiError(message, retryResponse.status);
          }

          return (await retryResponse.json()) as T;
        }
      }
    } catch (retryErr) {
      if (retryErr instanceof RestApiError) {
        throw retryErr;
      }
    }

    emitAuthExpired();
    const message = await readErrorMessage(response);
    throw new RestApiError(message, 401);
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new RestApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export async function requestFormJson<T>(path: string, formData: FormData): Promise<T> {
  const accessToken = await resolveAccessToken();
  const baseUrl = resolveApiBaseUrl();
  const url = new URL(path, baseUrl).toString();
  const headers = buildHeaders(accessToken, true, "form");

  const response = await executeFetch(url, "POST", headers, formData, "form");

  if (response.status === 401) {
    try {
      const daemonClient = await getDaemonClient();
      const status = await daemonClient.app.checkAuthStatus();
      if (status.authenticated) {
        const retryToken = await daemonClient.app.getAccessToken();
        if (retryToken?.accessToken) {
          const retryHeaders = buildHeaders(retryToken.accessToken, true, "form");
          const retryResponse = await executeFetch(url, "POST", retryHeaders, formData, "form");

          if (!retryResponse.ok) {
            const message = await readErrorMessage(retryResponse);
            throw new RestApiError(message, retryResponse.status);
          }

          return (await retryResponse.json()) as T;
        }
      }
    } catch (retryErr) {
      if (retryErr instanceof RestApiError) {
        throw retryErr;
      }
    }

    emitAuthExpired();
    const message = await readErrorMessage(response);
    throw new RestApiError(message, 401);
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new RestApiError(message, response.status);
  }

  return (await response.json()) as T;
}
