export const DEFAULT_REMOTE_API_BASE_URL = "https://api.yishan.io";
export const DEFAULT_DEV_REMOTE_API_BASE_URL = "http://localhost:8787";

type RendererHostBridge = {
  getAuthTokens?: () => Promise<{
    authenticated: boolean;
    accessToken?: string;
  }>;
};

async function resolveAuthHeader(): Promise<string | undefined> {
  if (typeof window === "undefined") {
    return undefined;
  }

  const bridge = (window as typeof window & { __YISHAN__?: { host?: RendererHostBridge } }).__YISHAN__;
  if (!bridge?.host?.getAuthTokens) {
    return undefined;
  }

  try {
    const authTokens = await bridge.host.getAuthTokens();
    if (!authTokens.authenticated || !authTokens.accessToken) {
      return undefined;
    }

    return `Bearer ${authTokens.accessToken}`;
  } catch {
    return undefined;
  }
}

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return import.meta.env.DEV ? DEFAULT_DEV_REMOTE_API_BASE_URL : DEFAULT_REMOTE_API_BASE_URL;
}

export class RestApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RestApiError";
    this.status = status;
  }
}

/** Sends one JSON request to remote api-service and returns parsed JSON response body. */
export async function requestJson<T>(
  path: string,
  input?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
  },
): Promise<T> {
  const baseUrl = resolveApiBaseUrl();
  const url = new URL(path, baseUrl);
  const authHeader = await resolveAuthHeader();
  const headers: Record<string, string> = {};
  if (input?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const response = await fetch(url.toString(), {
    method: input?.method ?? "GET",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    credentials: "include",
    body: input?.body === undefined ? undefined : JSON.stringify(input.body),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error?.trim()) {
        message = payload.error;
      }
    } catch {
      // ignore parse errors and keep fallback message
    }

    throw new RestApiError(message, response.status);
  }

  return (await response.json()) as T;
}
