/**
 * Web Worker that runs the markdown → HTML pipeline off the main thread.
 *
 * Accepts markdown source text via postMessage, runs the full unified pipeline
 * (remark-parse → remark-gfm → remark-rehype → rehype-raw → rehype-sanitize →
 * rehype-highlight → rehype-stringify), and posts back the final HTML string.
 *
 * This keeps the main thread free during expensive parsing and syntax highlighting.
 *
 * NOTE: The `document` global must be shimmed before this module loads.
 * See markdownWorkerService.ts which creates the worker via a blob wrapper
 * that sets the shim before importing this module.
 */

import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

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

/**
 * Pre-built unified processor. Reused across requests to avoid re-creating
 * the plugin chain on every parse.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeHighlight, { detect: false })
  .use(rehypeStringify);

export type MarkdownWorkerRequest = {
  id: string;
  content: string;
};

export type MarkdownWorkerResponse = {
  id: string;
  html?: string;
  error?: string;
};

self.addEventListener("message", async (event: MessageEvent<MarkdownWorkerRequest>) => {
  const { id, content } = event.data;
  if (!id) return;

  try {
    const result = await processor.process(content);
    const response: MarkdownWorkerResponse = {
      id,
      html: String(result),
    };
    self.postMessage(response);
  } catch (err) {
    const response: MarkdownWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
});
