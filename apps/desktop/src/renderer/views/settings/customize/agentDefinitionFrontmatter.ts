/**
 * Rewrites the `model` and `thinking` keys inside an agent definition's
 * leading YAML frontmatter block. Used by the agent edit dialog so the
 * model/thinking selector persists into the definition file itself (the
 * frontmatter is the single source of truth) instead of a sidecar file.
 *
 * - A non-empty value replaces the key's first line in the block, or is
 *   inserted before the closing `---` when the key is absent.
 * - An empty value drops the key line (field omitted, meaning "inherit").
 * - Content without a frontmatter block is returned unchanged.
 */
export function applyFrontmatterModelThinking(content: string, model: string, thinking: string): string {
  const lines = content.split("\n");
  const closingIndex = findFrontmatterClosingIndex(lines);
  if (closingIndex === -1) {
    return content;
  }

  const values: Record<"model" | "thinking", string> = { model: model.trim(), thinking: thinking.trim() };
  const applied: Partial<Record<"model" | "thinking", boolean>> = {};
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i === closingIndex) {
      for (const key of ["model", "thinking"] as const) {
        if (values[key] !== "" && !applied[key]) {
          result.push(`${key}: ${values[key]}`);
        }
      }
    }
    const keyMatch = FRONTMATTER_KEY.exec(line);
    if (keyMatch && i < closingIndex) {
      const key = keyMatch[1] as "model" | "thinking";
      if (applied[key]) {
        // Duplicate key line: only the patched first occurrence is kept, so a
        // YAML last-wins parser cannot read a stale value past the rewrite.
        continue;
      }
      applied[key] = true;
      if (values[key] !== "") {
        result.push(`${key}: ${values[key]}`);
      }
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
}

const FRONTMATTER_KEY = /^(model|thinking):/;

function findFrontmatterClosingIndex(lines: string[]): number {
  if (lines.length < 2 || (lines[0] ?? "").trim() !== "---") {
    return -1;
  }
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? "").trim() === "---") {
      return i;
    }
  }
  return -1;
}
