/** Owns normalization of Expo Router string-or-array params into one string value. */
export function readRouteParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
