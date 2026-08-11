/**
 * Frontmatter helpers for agent definitions (markdown files with a leading
 * YAML frontmatter block). The metadata (name, description, model, thinking,
 * tools) lives in the frontmatter; the prompt body follows the closing ---.
 *
 * The edit dialogs manage the metadata through structured fields and show
 * only the body in the markdown editor, so these helpers split the body out
 * and patch the frontmatter keys back in without rewriting lines the user
 * did not touch.
 */

/** Keys applyFrontmatterMetadata can patch, in insertion order. */
const SCALAR_KEYS = ["description", "model", "thinking"] as const;
const TOOLS_KEY = "tools";

export type AgentFrontmatterChanges = {
  description?: string;
  model?: string;
  thinking?: string;
  /** Empty array removes the tools block; undefined leaves it untouched. */
  tools?: string[];
};

/** Renders a value as a double-quoted YAML scalar (mirrors the daemon's yamlQuotedScalar). */
function yamlQuoteScalar(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "");
  return `"${escaped}"`;
}

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

/**
 * Returns the prompt body of an agent definition: everything after the
 * closing frontmatter delimiter, with the standard single blank-line
 * separator stripped. Content without a frontmatter block is returned
 * unchanged (the whole file is body).
 */
export function splitAgentBody(content: string): string {
  const lines = content.split("\n");
  const closingIndex = findFrontmatterClosingIndex(lines);
  if (closingIndex === -1) {
    return content;
  }
  const bodyLines = lines.slice(closingIndex + 1);
  if ((bodyLines[0] ?? "") === "") {
    bodyLines.shift();
  }
  return bodyLines.join("\n");
}

/**
 * Swaps the prompt body of an agent definition, keeping the frontmatter
 * byte-identical. The body is joined after the closing delimiter with one
 * blank line (the canonical separator). Content without a frontmatter block
 * is replaced wholesale — the whole file is body.
 */
export function replaceAgentBody(content: string, body: string): string {
  const lines = content.split("\n");
  const closingIndex = findFrontmatterClosingIndex(lines);
  if (closingIndex === -1) {
    return body;
  }
  const head = lines.slice(0, closingIndex + 1).join("\n");
  if (body === "") {
    return head;
  }
  return `${head}\n\n${body}`;
}

/**
 * Rewrites the metadata keys of an agent definition's frontmatter block.
 *
 * - A key present in `changes` is replaced at its first occurrence (duplicate
 *   key lines are dropped so a YAML last-wins parser cannot read a stale
 *   value) or inserted before the closing `---` when absent.
 * - An empty scalar value drops the key line; an empty tools array drops the
 *   whole tools block.
 * - `description` is written as a double-quoted YAML scalar; model/thinking
 *   stay unquoted (their values never need escaping).
 * - Unmanaged keys (e.g. `read_only`) and their raw lines are preserved
 *   verbatim. Content without a frontmatter block is returned unchanged.
 */
export function applyFrontmatterMetadata(content: string, changes: AgentFrontmatterChanges): string {
  const lines = content.split("\n");
  const closingIndex = findFrontmatterClosingIndex(lines);
  if (closingIndex === -1) {
    return content;
  }

  const blocks = tokenizeFrontmatter(lines.slice(1, closingIndex));
  const seen = new Set<string>();
  const emitted: string[] = [];

  const emitScalar = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed === "") {
      return;
    }
    emitted.push(`${key}: ${key === "description" ? yamlQuoteScalar(trimmed) : trimmed}`);
  };
  const emitTools = (tools: string[]) => {
    const items = tools.map((tool) => tool.trim()).filter((tool) => tool !== "");
    if (items.length === 0) {
      return;
    }
    emitted.push("tools:");
    for (const item of items) {
      emitted.push(`  - ${item}`);
    }
  };

  for (const block of blocks) {
    if (block.kind === "scalar" && isChangedScalar(block.key, changes)) {
      if (seen.has(block.key)) {
        continue; // duplicate key line: only the first occurrence is kept
      }
      seen.add(block.key);
      emitScalar(block.key, changes[block.key as (typeof SCALAR_KEYS)[number]] ?? "");
      continue;
    }
    if (block.kind === "tools" && changes.tools !== undefined) {
      if (seen.has(TOOLS_KEY)) {
        continue;
      }
      seen.add(TOOLS_KEY);
      emitTools(changes.tools);
      continue;
    }
    emitted.push(...block.lines);
  }

  // Changed keys that were absent get inserted before the closing delimiter.
  for (const key of SCALAR_KEYS) {
    if (changes[key] !== undefined && !seen.has(key)) {
      seen.add(key);
      emitScalar(key, changes[key]);
    }
  }
  if (changes.tools !== undefined && !seen.has(TOOLS_KEY)) {
    seen.add(TOOLS_KEY);
    emitTools(changes.tools);
  }

  return [...lines.slice(0, 1), ...emitted, ...lines.slice(closingIndex)].join("\n");
}

function isChangedScalar(key: string, changes: AgentFrontmatterChanges): boolean {
  return key === "description" || key === "model" || key === "thinking" ? changes[key] !== undefined : false;
}

type FrontmatterBlock =
  | { kind: "scalar"; key: string; lines: string[] }
  | { kind: "tools"; lines: string[] }
  | { kind: "raw"; lines: string[] };

/**
 * Splits frontmatter lines into logical blocks so patches can replace whole
 * multi-line values (tools lists, block scalars) instead of leaving their
 * continuation lines dangling. Unrecognized lines stay raw and are emitted
 * verbatim.
 */
function tokenizeFrontmatter(lines: string[]): FrontmatterBlock[] {
  const blocks: FrontmatterBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const keyMatch = /^([^:\s][^:]*):\s*(.*)$/.exec(line.trim());
    if (keyMatch) {
      // The key is trimmed so `description : old` (valid YAML, same as
      // `description: old`) matches the same key the Go parser reports.
      const key = (keyMatch[1] ?? "").trim();
      const value = keyMatch[2] ?? "";
      if (key === TOOLS_KEY) {
        const blockLines = [line];
        let j = i + 1;
        // Items may be indented (`  - read`) or at column 0 (`- read`); the
        // Go collector accepts both, so both must be consumed here.
        while (j < lines.length && /^[ \t]*-/.test(lines[j] ?? "")) {
          blockLines.push(lines[j] ?? "");
          j += 1;
        }
        blocks.push({ kind: "tools", lines: blockLines });
        i = j;
        continue;
      }
      if (/^[|>][-+]?$/.test(value)) {
        // Block-scalar indicator (|, >, |- …): consume indented continuation
        // lines so a replaced scalar cannot strand them.
        const blockLines = [line];
        let j = i + 1;
        while (j < lines.length && /^[ \t]/.test(lines[j] ?? "")) {
          blockLines.push(lines[j] ?? "");
          j += 1;
        }
        blocks.push({ kind: "scalar", key, lines: blockLines });
        i = j;
        continue;
      }
      blocks.push({ kind: "scalar", key, lines: [line] });
      i += 1;
      continue;
    }
    blocks.push({ kind: "raw", lines: [line] });
    i += 1;
  }
  return blocks;
}

/**
 * Rewrites the `model` and `thinking` keys inside an agent definition's
 * leading YAML frontmatter block. Kept as a thin wrapper over
 * applyFrontmatterMetadata for callers that only patch the model/thinking
 * selector.
 *
 * - A non-empty value replaces the key's first line in the block, or is
 *   inserted before the closing `---` when the key is absent.
 * - An empty value drops the key line (field omitted, meaning "inherit").
 * - Content without a frontmatter block is returned unchanged.
 */
export function applyFrontmatterModelThinking(content: string, model: string, thinking: string): string {
  return applyFrontmatterMetadata(content, { model, thinking });
}
