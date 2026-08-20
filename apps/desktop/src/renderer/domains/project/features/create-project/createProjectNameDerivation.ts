/** Converts one local path or URL into a default project display name. */
export function deriveDefaultProjectName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\\+$/g, "").replace(/\/+$/g, "");
  const segment =
    normalized
      .split(/[\\/]/)
      .filter((part) => part.length > 0)
      .at(-1) ?? "";
  return segment.replace(/\.git$/i, "");
}
