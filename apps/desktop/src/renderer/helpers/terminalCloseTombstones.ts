const TOMBSTONE_TTL_MS = 5000;

const explicitlyClosedTerminalTabIds = new Map<string, number>();

export function recordExplicitlyClosedTerminalTabId(tabId: string): void {
  const normalizedTabId = tabId.trim();
  if (!normalizedTabId) {
    return;
  }

  explicitlyClosedTerminalTabIds.set(normalizedTabId, Date.now() + TOMBSTONE_TTL_MS);
  pruneExpiredTombstones();
}

export function consumeExplicitlyClosedTerminalTabId(tabId: string): boolean {
  const normalizedTabId = tabId.trim();
  if (!normalizedTabId) {
    return false;
  }

  const expiry = explicitlyClosedTerminalTabIds.get(normalizedTabId);
  if (expiry === undefined) {
    return false;
  }

  if (Date.now() > expiry) {
    explicitlyClosedTerminalTabIds.delete(normalizedTabId);
    return false;
  }

  return true;
}

function pruneExpiredTombstones(): void {
  const now = Date.now();
  for (const [tabId, expiry] of explicitlyClosedTerminalTabIds) {
    if (now > expiry) {
      explicitlyClosedTerminalTabIds.delete(tabId);
    }
  }
}

export function __resetExplicitlyClosedTerminalTabIdsForTests(): void {
  explicitlyClosedTerminalTabIds.clear();
}
