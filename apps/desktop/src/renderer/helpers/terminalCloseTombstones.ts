const explicitlyClosedTerminalTabIds = new Set<string>();

export function recordExplicitlyClosedTerminalTabId(tabId: string): void {
  const normalizedTabId = tabId.trim();
  if (!normalizedTabId) {
    return;
  }

  explicitlyClosedTerminalTabIds.add(normalizedTabId);
}

export function consumeExplicitlyClosedTerminalTabId(tabId: string): boolean {
  const normalizedTabId = tabId.trim();
  if (!normalizedTabId) {
    return false;
  }

  if (!explicitlyClosedTerminalTabIds.has(normalizedTabId)) {
    return false;
  }

  explicitlyClosedTerminalTabIds.delete(normalizedTabId);
  return true;
}

export function __resetExplicitlyClosedTerminalTabIdsForTests(): void {
  explicitlyClosedTerminalTabIds.clear();
}
