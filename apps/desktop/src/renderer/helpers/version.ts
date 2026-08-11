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
