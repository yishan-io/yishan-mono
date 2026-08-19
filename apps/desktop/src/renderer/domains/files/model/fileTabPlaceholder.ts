import { isExcalidrawFile } from "@renderer/domains/files";

/**
 * Produces minimal placeholder content for a file tab opened without
 * pre-loaded content. The actual file content is loaded asynchronously by
 * `useOpenTabAutoRefresh` and replaces this placeholder via
 * `refreshFileTabFromDisk` (desktop6-adjust.md W6 task 16).
 */
export function createFileTabPlaceholder(path: string): string {
  if (isExcalidrawFile(path)) {
    return "";
  }
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? path;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "ts" || extension === "tsx") {
    return [
      `// ${path}`,
      "export function example() {",
      `  return "Open file: ${fileName}";`,
      "}",
      "",
      "console.log(example());",
    ].join("\n");
  }

  if (extension === "json") {
    return ["{", `  "path": "${path}",`, '  "status": "mock-content"', "}"].join("\n");
  }

  if (extension === "md") {
    return [
      `# ${fileName}`,
      "",
      `Opened from ${path}`,
      "",
      "This is mock file content rendered in Monaco Editor.",
    ].join("\n");
  }

  return [`Opened: ${path}`, "", "This tab is backed by a file tab in the workspace store."].join("\n");
}
