import { describe, expect, it } from "vitest";
import { resolveClipboardSource } from "./clipboardSourceResolvers";

describe("resolveClipboardSource", () => {
  it("prioritizes internal move clipboard over external paths", () => {
    const result = resolveClipboardSource({
      clipboardState: {
        requestId: 1,
        mode: "move",
        sourcePaths: ["src/a.ts"],
        externalClipboardSnapshotSourcePaths: ["/Users/test/Desktop/a.ts"],
      },
      externalSourcePaths: ["/Users/test/Desktop/other.ts"],
      externalFilePayloads: [],
    });

    expect(result).toEqual({
      kind: "internal",
      mode: "move",
      sourcePaths: ["src/a.ts"],
    });
  });

  it("uses external paths when there is no internal clipboard state", () => {
    const result = resolveClipboardSource({
      clipboardState: null,
      externalSourcePaths: ["/Users/test/Desktop/a.ts"],
      externalFilePayloads: [],
    });

    expect(result).toEqual({
      kind: "external-paths",
      sourcePaths: ["/Users/test/Desktop/a.ts"],
    });
  });

  it("uses external paths when they differ from the internal copy snapshot", () => {
    const result = resolveClipboardSource({
      clipboardState: {
        requestId: 1,
        mode: "copy",
        sourcePaths: ["src/a.ts"],
        externalClipboardSnapshotSourcePaths: ["/Users/test/Desktop/old.ts"],
      },
      externalSourcePaths: ["/Users/test/Desktop/new.ts"],
      externalFilePayloads: [],
    });

    expect(result).toEqual({
      kind: "external-paths",
      sourcePaths: ["/Users/test/Desktop/new.ts"],
    });
  });

  it("keeps internal copy clipboard when external paths match snapshot", () => {
    const result = resolveClipboardSource({
      clipboardState: {
        requestId: 1,
        mode: "copy",
        sourcePaths: ["src/a.ts"],
        externalClipboardSnapshotSourcePaths: ["/Users/test/Desktop/a.ts"],
      },
      externalSourcePaths: ["/Users/test/Desktop/a.ts"],
      externalFilePayloads: [],
    });

    expect(result).toEqual({
      kind: "internal",
      mode: "copy",
      sourcePaths: ["src/a.ts"],
    });
  });

  it("uses external file payloads when no internal clipboard state exists", () => {
    const result = resolveClipboardSource({
      clipboardState: null,
      externalSourcePaths: [],
      externalFilePayloads: [{ relativePath: "pasted-1.png", contentBase64: "Ym9keQ==" }],
    });

    expect(result).toEqual({
      kind: "external-file-payloads",
      filePayloads: [{ relativePath: "pasted-1.png", contentBase64: "Ym9keQ==" }],
    });
  });

  it("keeps internal copy clipboard over external payloads when internal state exists", () => {
    const result = resolveClipboardSource({
      clipboardState: {
        requestId: 1,
        mode: "copy",
        sourcePaths: ["src/a.ts"],
        externalClipboardSnapshotSourcePaths: null,
      },
      externalSourcePaths: [],
      externalFilePayloads: [{ relativePath: "pasted-1.png", contentBase64: "Ym9keQ==" }],
    });

    expect(result).toEqual({
      kind: "internal",
      mode: "copy",
      sourcePaths: ["src/a.ts"],
    });
  });
});
