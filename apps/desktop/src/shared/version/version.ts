/** Returns true when `installed` is an older version than `latest`. */
export function isNewerVersion(installed: string | undefined, latest: string | undefined): boolean {
  if (!installed || !latest) {
    return false;
  }
  const parse = (value: string): number[] =>
    (value.split(/[-+]/)[0] ?? "").split(".").map((segment) => Number.parseInt(segment, 10) || 0);
  const installedParts = parse(installed);
  const latestParts = parse(latest);
  for (let index = 0; index < 3; index += 1) {
    const left = installedParts[index] ?? 0;
    const right = latestParts[index] ?? 0;
    if (left !== right) {
      return left < right;
    }
  }
  return false;
}
function parseVersion(value: string): number[] | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const core = normalized.split("-")[0]?.split("+")[0]?.trim();
  if (!core) {
    return null;
  }

  const parts = core.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part) || part < 0)) {
    return null;
  }

  return parts;
}

function compareVersionParts(left: number[], right: number[]): number {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart > rightPart) {
      return 1;
    }
    if (leftPart < rightPart) {
      return -1;
    }
  }
  return 0;
}

/** Returns true when daemon version is behind the desktop app version. */
export function isDaemonVersionOutdated(input: { daemonVersion?: string; appVersion?: string }): boolean {
  const daemonParts = input.daemonVersion ? parseVersion(input.daemonVersion) : null;
  const appParts = input.appVersion ? parseVersion(input.appVersion) : null;
  if (!daemonParts || !appParts) {
    return false;
  }

  return compareVersionParts(daemonParts, appParts) < 0;
}
