import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Rehype plugin: transforms mermaid fenced code blocks into <pre class="mermaid">
 * elements so that rehypeHighlight does not attempt to syntax-highlight them.
 *
 * Runs after remarkRehype + rehypeRaw (when the HAST tree is built) but before
 * rehypeSanitize and rehypeHighlight.
 */
function rehypeMermaid() {
  return (tree: any) => {
    function toClassList(value: unknown): string[] {
      if (Array.isArray(value)) {
        return value.map(String);
      }
      if (typeof value === "string") {
        return value.split(/\s+/).filter(Boolean);
      }
      return [];
    }

    function walk(node: any, parent?: any) {
      if (node.type === "element") {
        const classList = toClassList(node.properties?.className);
        if (
          node.tagName === "code" &&
          classList.includes("language-mermaid")
        ) {
          // Strip language-mermaid class so rehypeHighlight skips this node.
          node.properties.className = classList.filter(
            (c: string) => c !== "language-mermaid",
          );
          // Add a mermaid class on the parent <pre> for the MarkdownPreview selector.
          if (parent && parent.type === "element" && parent.tagName === "pre") {
            parent.properties = parent.properties ?? {};
            const parentClassList = toClassList(parent.properties.className);
            if (!parentClassList.includes("mermaid")) {
              parentClassList.push("mermaid");
            }
            parent.properties.className = parentClassList;
          }
        }
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            walk(child, node);
          }
        }
      }
    }
    walk(tree);
  };
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "div",
    "span",
    "details",
    "summary",
    "abbr",
    "kbd",
    "mark",
    "sub",
    "sup",
    "br",
    "wbr",
    "figure",
    "figcaption",
    "picture",
    "source",
    "dl",
    "dt",
    "dd",
    "cite",
    "dfn",
    "var",
    "samp",
    "ruby",
    "rt",
    "rp",
    "bdi",
    "bdo",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      "style",
      "title",
      "role",
      "aria-*",
      "data-*",
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "width",
      "height",
    ],
    td: [
      ...(defaultSchema.attributes?.td ?? []),
      "colspan",
      "rowspan",
    ],
    th: [
      ...(defaultSchema.attributes?.th ?? []),
      "colspan",
      "rowspan",
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      "checked",
      "disabled",
    ],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeMermaid)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHighlight, { detect: false })
  .use(rehypeStringify);

export async function parseMarkdownToHtml(content: string): Promise<string> {
  const result = await processor.process(content);
  return String(result);
}
