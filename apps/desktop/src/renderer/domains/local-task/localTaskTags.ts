/** Maximum number of tags accepted for a Local Task. */
export const MAX_LOCAL_TASK_TAGS = 12;
/** Maximum Unicode code points accepted in one Local Task tag. */
export const MAX_LOCAL_TASK_TAG_CODE_POINTS = 32;

/** Normalizes display text for immediate Local Task tag UX checks. */
export function normalizeLocalTaskTag(tag: string): string {
  return tag.trim().normalize("NFC");
}

/** Returns a UX validation error for Local Task tags, or null when they are locally valid. */
export function getLocalTaskTagsValidationError(tags: string[]): string | null {
  if (tags.length > MAX_LOCAL_TASK_TAGS) {
    return `A task can have at most ${MAX_LOCAL_TASK_TAGS} tags.`;
  }

  const seenTags = new Set<string>();
  for (const tag of tags) {
    const normalizedTag = normalizeLocalTaskTag(tag);
    if (normalizedTag.length === 0) return "Tags cannot be empty.";
    if (Array.from(normalizedTag).length > MAX_LOCAL_TASK_TAG_CODE_POINTS) {
      return `Tags can contain at most ${MAX_LOCAL_TASK_TAG_CODE_POINTS} characters.`;
    }

    // This is intentionally only a local UX check; daemon Unicode folding is authoritative.
    const basicDuplicateKey = normalizedTag.toLowerCase();
    if (seenTags.has(basicDuplicateKey)) return "Tags must be unique.";
    seenTags.add(basicDuplicateKey);
  }
  return null;
}
