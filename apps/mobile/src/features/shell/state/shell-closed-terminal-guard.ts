const closedTerminalIds = new Set<string>();

export function markClosedTerminalId(terminalId: string) {
  closedTerminalIds.add(terminalId);
}

export function unmarkClosedTerminalId(terminalId: string) {
  closedTerminalIds.delete(terminalId);
}

export function isClosedTerminalIdSuppressed(terminalId: string) {
  return closedTerminalIds.has(terminalId);
}

export function listClosedTerminalIds() {
  return Array.from(closedTerminalIds);
}

export function clearClosedTerminalIds(terminalIds?: Iterable<string>) {
  if (!terminalIds) {
    closedTerminalIds.clear();
    return;
  }

  for (const terminalId of terminalIds) {
    closedTerminalIds.delete(terminalId);
  }
}
