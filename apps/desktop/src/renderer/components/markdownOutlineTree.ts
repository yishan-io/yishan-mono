export type MarkdownOutlineItem = {
  id: string;
  title: string;
  level: number;
  children: MarkdownOutlineItem[];
};

export type MarkdownOutlineEntry = {
  id: string;
  title: string;
  level: number;
  element: HTMLHeadingElement;
};

export type MarkdownOutlineData = {
  items: MarkdownOutlineItem[];
  entries: MarkdownOutlineEntry[];
};

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const FALLBACK_HEADING_SLUG = "section";

function slugifyHeading(text: string): string {
  const normalized = text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");

  return normalized || FALLBACK_HEADING_SLUG;
}

function getHeadingLevel(element: HTMLHeadingElement): number {
  return Number.parseInt(element.tagName.slice(1), 10);
}

function buildUniqueHeadingId(baseSlug: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseSlug)) {
    usedIds.add(baseSlug);
    return baseSlug;
  }

  let suffix = 2;
  let nextId = `${baseSlug}-${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `${baseSlug}-${suffix}`;
  }

  usedIds.add(nextId);
  return nextId;
}

/** Collects rendered heading nodes, ensures each has an ID, and returns a nested outline tree. */
export function extractMarkdownOutline(container: HTMLElement): MarkdownOutlineData {
  const headings = Array.from(container.querySelectorAll<HTMLHeadingElement>(HEADING_SELECTOR));
  if (headings.length === 0) {
    return { items: [], entries: [] };
  }

  const usedIds = new Set<string>();
  const items: MarkdownOutlineItem[] = [];
  const entries: MarkdownOutlineEntry[] = [];
  const stack: MarkdownOutlineItem[] = [];

  for (const heading of headings) {
    const title = heading.textContent?.trim() ?? "";
    const level = getHeadingLevel(heading);
    const existingId = heading.id.trim();
    const baseSlug = existingId || slugifyHeading(title);
    const id = buildUniqueHeadingId(baseSlug, usedIds);

    if (heading.id !== id) {
      heading.id = id;
    }

    const item: MarkdownOutlineItem = {
      id,
      title: title || heading.tagName.toLowerCase(),
      level,
      children: [],
    };

    entries.push({ id, title: item.title, level, element: heading });

    while (true) {
      const lastItem = stack.at(-1);
      if (!lastItem || lastItem.level < level) {
        break;
      }

      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(item);
    } else {
      items.push(item);
    }

    stack.push(item);
  }

  return { items, entries };
}
