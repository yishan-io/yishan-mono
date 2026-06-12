export interface SkillMetadata {
  [key: string]: string;
}

/** Parses simple YAML (string keys, one nesting level) into a flat Record. */
function parseSimpleYaml(text: string): SkillMetadata {
  const result: SkillMetadata = {};
  const lines = text.split("\n");
  let currentParent: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.search(/\S/);
    const match = /^\s*([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key === undefined || value === undefined) continue;

    if (indent === 0) {
      if (value === "") {
        currentParent = key;
      } else {
        result[key] = value;
        currentParent = null;
      }
    } else if (currentParent && value !== "") {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extracts YAML frontmatter from markdown content.
 * Returns the parsed metadata (flattened) and the remaining body content.
 * Returns { metadata: null, body: content } when no frontmatter is present.
 */
export function parseFrontmatter(content: string): {
  metadata: SkillMetadata | null;
  body: string;
} {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(content);
  if (!match) return { metadata: null, body: content };

  const frontmatterMatch = match[1];
  if (!frontmatterMatch) return { metadata: null, body: content };

  const frontmatterText = frontmatterMatch;
  const body = content.slice(match[0].length);
  const metadata = parseSimpleYaml(frontmatterText);

  if (Object.keys(metadata).length === 0) {
    return { metadata: null, body: content };
  }

  return { metadata, body };
}

/**
 * Toggles the checked state of a task list item at the given index in markdown content.
 * Returns the modified content string.
 */
export function toggleTaskListItem(content: string, taskItemIndex: number, checked: boolean): string {
  const lines = content.split("\n");
  let currentTaskItemIndex = 0;
  const taskPattern = /^(\s*(?:[-*+]|\d+\.)\s+\[)( |x|X)(\].*)$/;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      continue;
    }
    const match = taskPattern.exec(line);
    if (!match) {
      continue;
    }

    if (currentTaskItemIndex === taskItemIndex) {
      const prefix = match[1];
      const suffix = match[3];
      lines[lineIndex] = `${prefix}${checked ? "x" : " "}${suffix}`;
      return lines.join("\n");
    }

    currentTaskItemIndex += 1;
  }

  return content;
}

/**
 * Returns the checked state of a task list item at the given index, or null if not found.
 */
export function getTaskListItemChecked(content: string, taskItemIndex: number): boolean | null {
  const lines = content.split("\n");
  let currentTaskItemIndex = 0;
  const taskPattern = /^(\s*(?:[-*+]|\d+\.)\s+\[)( |x|X)(\].*)$/;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line === undefined) {
      continue;
    }
    const match = taskPattern.exec(line);
    if (!match) {
      continue;
    }

    if (currentTaskItemIndex === taskItemIndex) {
      const checked = match[2];
      return checked !== undefined && checked.toLowerCase() === "x";
    }

    currentTaskItemIndex += 1;
  }

  return null;
}

/** Returns true when the src is an absolute URL (data URI or scheme://). */
export function isAbsoluteUrl(src: string): boolean {
  return /^data:/i.test(src) || /^[a-z][a-z0-9+.-]*:/i.test(src);
}

/** Resolves a relative path against a base directory. */
export function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir ? baseDir.split("/") : [];
  const segments = relativePath.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      if (parts.length > 0) parts.pop();
    } else if (segment !== "." && segment !== "") {
      parts.push(segment);
    }
  }
  return parts.join("/");
}
