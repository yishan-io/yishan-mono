const CLOSED_BACKEND_SESSION_SUPPRESSION_MS = 15000;

const closedBackendSessionExpiryByKey = new Map<string, number>();

function buildClosedBackendSessionKey(workspaceId: string, sessionId: string) {
  return `${workspaceId}\u0000${sessionId}`;
}

function isExpired(expiresAt: number) {
  return expiresAt <= Date.now();
}

export function markClosedBackendSession(workspaceId: string, sessionId: string) {
  closedBackendSessionExpiryByKey.set(
    buildClosedBackendSessionKey(workspaceId, sessionId),
    Date.now() + CLOSED_BACKEND_SESSION_SUPPRESSION_MS,
  );
}

export function clearClosedBackendSession(workspaceId: string, sessionId: string) {
  closedBackendSessionExpiryByKey.delete(buildClosedBackendSessionKey(workspaceId, sessionId));
}

export function isClosedBackendSessionSuppressed(workspaceId: string, sessionId: string) {
  const key = buildClosedBackendSessionKey(workspaceId, sessionId);
  const expiresAt = closedBackendSessionExpiryByKey.get(key);
  if (!expiresAt) {
    return false;
  }

  if (isExpired(expiresAt)) {
    closedBackendSessionExpiryByKey.delete(key);
    return false;
  }

  return true;
}
