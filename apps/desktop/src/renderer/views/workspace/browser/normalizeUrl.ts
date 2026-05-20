export function normalizeUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // If input has no spaces and looks like a domain/hostname, treat as URL
  if (!/\s/.test(trimmed)) {
    if (
      trimmed.includes(".") ||
      trimmed === "localhost" ||
      trimmed.startsWith("localhost:") ||
      trimmed.startsWith("[")
    ) {
      return `https://${trimmed}`;
    }
  }

  // Not a recognizable URL — search Google
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}
