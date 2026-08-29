export type DSHPluginBundle = { name: string; version: string; enabled: boolean };
export type DSHOfficialPluginBundle = { name: string; version: string };

/** Converts the bounded daemon bundle DTO into renderer state. */
export function parseDSHPluginBundles(payload: unknown): DSHPluginBundle[] {
  if (typeof payload !== "object" || payload === null || !("bundles" in payload) || !Array.isArray(payload.bundles)) {
    return [];
  }
  return payload.bundles.flatMap((bundle) => {
    if (typeof bundle !== "object" || bundle === null) return [];
    const { name, version, enabled } = bundle as Record<string, unknown>;
    return typeof name === "string" && typeof version === "string" && typeof enabled === "boolean"
      ? [{ name, version, enabled }]
      : [];
  });
}

/** Converts daemon-owned official install candidates into renderer state. */
export function parseDSHOfficialPluginBundles(payload: unknown): DSHOfficialPluginBundle[] {
  if (typeof payload !== "object" || payload === null || !("bundles" in payload) || !Array.isArray(payload.bundles)) {
    return [];
  }
  return payload.bundles.flatMap((bundle) => {
    if (typeof bundle !== "object" || bundle === null) return [];
    const { name, version } = bundle as Record<string, unknown>;
    return typeof name === "string" && typeof version === "string" ? [{ name, version }] : [];
  });
}
