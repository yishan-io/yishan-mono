import { describe, expect, it } from "vitest";
import {
  type IconThemeManifest,
  buildMaterialFileExtensions,
  findMissingMaterialExtensionAliases,
  resolveMaterialFileIconId,
} from "./materialIconTheme";

const baseManifest = {
  file: "default-file",
  fileNames: {},
  fileExtensions: {
    "d.ts": "typescript-def",
    htm: "html",
    js: "custom-js",
    tsx: "react_ts",
  },
  languageIds: {
    typescript: "typescript",
    javascript: "javascript",
    html: "html",
    yaml: "yaml",
    php: "php",
    tex: "tex",
  },
} satisfies Pick<IconThemeManifest, "file" | "fileNames" | "fileExtensions" | "languageIds">;

describe("buildMaterialFileExtensions", () => {
  it("fills canonical extension aliases from language ids without overwriting explicit mappings", () => {
    const fileExtensions = buildMaterialFileExtensions(baseManifest);

    expect(fileExtensions.ts).toBe("typescript");
    expect(fileExtensions.cts).toBe("typescript");
    expect(fileExtensions.mts).toBe("typescript");
    expect(fileExtensions.html).toBe("html");
    expect(fileExtensions.js).toBe("custom-js");
    expect(fileExtensions.cjs).toBe("javascript");
    expect(fileExtensions.tsx).toBe("react_ts");
    expect(fileExtensions.yaml).toBe("yaml");
    expect(fileExtensions.yml).toBe("yaml");
    expect(fileExtensions.php).toBe("php");
    expect(fileExtensions.tex).toBe("tex");
  });

  it("resolves representative filenames to the expected icon ids", () => {
    expect(resolveMaterialFileIconId("index.ts", baseManifest)).toBe("typescript");
    expect(resolveMaterialFileIconId("index.d.ts", baseManifest)).toBe("typescript-def");
    expect(resolveMaterialFileIconId("index.html", baseManifest)).toBe("html");
    expect(resolveMaterialFileIconId("index.yaml", baseManifest)).toBe("yaml");
    expect(resolveMaterialFileIconId("index.yml", baseManifest)).toBe("yaml");
    expect(resolveMaterialFileIconId("index.php", baseManifest)).toBe("php");
    expect(resolveMaterialFileIconId("paper.tex", baseManifest)).toBe("tex");
    expect(resolveMaterialFileIconId("index.js", baseManifest)).toBe("custom-js");
    expect(resolveMaterialFileIconId("index.tsx", baseManifest)).toBe("react_ts");
    expect(resolveMaterialFileIconId("unknown.custom", baseManifest)).toBe("default-file");
  });

  it("reports curated alias gaps when upstream language ids are missing", () => {
    expect(
      findMissingMaterialExtensionAliases({
        fileExtensions: {},
        languageIds: {
          html: "html",
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        { languageId: "typescript", extension: "ts" },
        { languageId: "yaml", extension: "yaml" },
      ]),
    );
  });
});
