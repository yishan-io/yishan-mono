import { describe, expect, it } from "vitest";
import { createFileTabPlaceholder } from "./fileTabPlaceholder";

describe("createFileTabPlaceholder (moves to features/file-editor after P29)", () => {
  it("returns empty content for .excalidraw files", () => {
    expect(createFileTabPlaceholder("/repo/design.excalidraw")).toBe("");
  });

  it("treats .excalidraw.json as a regular JSON file (only the bare .excalidraw extension is special)", () => {
    const content = createFileTabPlaceholder("/repo/sketch.excalidraw.json");
    expect(content).toContain('"status": "mock-content"');
  });

  it("builds a TypeScript placeholder from the path", () => {
    const content = createFileTabPlaceholder("/repo/src/example.ts");
    expect(content).toContain("// /repo/src/example.ts");
    expect(content).toContain("export function example()");
    expect(content).toContain('return "Open file: example.ts";');
  });

  it("builds a TypeScript placeholder for tsx files", () => {
    const content = createFileTabPlaceholder("/repo/src/App.tsx");
    expect(content).toContain("// /repo/src/App.tsx");
    expect(content).toContain("Open file: App.tsx");
  });

  it("builds a JSON placeholder", () => {
    const content = createFileTabPlaceholder("/repo/package.json");
    expect(content).toContain('"path": "/repo/package.json"');
    expect(content).toContain('"status": "mock-content"');
  });

  it("builds a markdown placeholder", () => {
    const content = createFileTabPlaceholder("/repo/README.md");
    expect(content).toContain("# README.md");
    expect(content).toContain("Opened from /repo/README.md");
  });

  it("builds a generic placeholder for unknown extensions", () => {
    const content = createFileTabPlaceholder("/repo/data.bin");
    expect(content).toContain("Opened: /repo/data.bin");
  });

  it("keeps the raw path in the comment but normalizes the file name", () => {
    const content = createFileTabPlaceholder("C:\\repo\\src\\main.ts");
    expect(content).toContain("// C:\\repo\\src\\main.ts");
    expect(content).toContain("Open file: main.ts");
  });
});
