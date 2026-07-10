import { apiRequest } from "@/lib/api/client";

type RelayNodeTokenResponse = {
  expiresAt: string;
  token: string;
};

type CachedRelayNodeToken = RelayNodeTokenResponse & {
  expiresAtMs: number;
};

const RELAY_TOKEN_REFRESH_BUFFER_MS = 30_000;
const relayNodeTokenCache = new Map<string, CachedRelayNodeToken>();
const relayNodeTokenInFlight = new Map<string, Promise<RelayNodeTokenResponse>>();

function buildRelayNodeTokenCacheKey(accessToken: string, nodeId: string) {
  return `${nodeId}::${accessToken}`;
}

function isRelayNodeTokenFresh(token: CachedRelayNodeToken) {
  return token.expiresAtMs - Date.now() > RELAY_TOKEN_REFRESH_BUFFER_MS;
}

function readRelayNodeTokenExpiry(expiresAt: string) {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) ? expiresAtMs : 0;
}

/** Clears the in-memory relay token cache. Used by tests and session resets. */
export function clearRelayNodeTokenCache() {
  relayNodeTokenCache.clear();
  relayNodeTokenInFlight.clear();
}

/** Resolves one short-lived node-scoped relay token from the API and caches it until near expiry. */
export async function getRelayNodeToken(input: {
  accessToken: string;
  nodeId: string;
}): Promise<RelayNodeTokenResponse> {
  const cacheKey = buildRelayNodeTokenCacheKey(input.accessToken, input.nodeId);
  const cachedToken = relayNodeTokenCache.get(cacheKey);
  if (cachedToken && isRelayNodeTokenFresh(cachedToken)) {
    return cachedToken;
  }

  const existingRequest = relayNodeTokenInFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = apiRequest<RelayNodeTokenResponse>(`/nodes/${encodeURIComponent(input.nodeId)}/relay-token`, {
    accessToken: input.accessToken,
    method: "POST",
  })
    .then((response) => {
      relayNodeTokenCache.set(cacheKey, {
        ...response,
        expiresAtMs: readRelayNodeTokenExpiry(response.expiresAt),
      });
      return response;
    })
    .finally(() => {
      relayNodeTokenInFlight.delete(cacheKey);
    });

  relayNodeTokenInFlight.set(cacheKey, request);
  return request;
}
