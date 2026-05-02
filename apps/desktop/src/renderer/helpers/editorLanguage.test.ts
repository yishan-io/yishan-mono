import { describe, expect, it } from "vitest";
import { getFileExtension, getLanguageExtension, getSupportedExtensions, isLanguageSupported } from "./editorLanguage";

describe("editorLanguage", () => {
  describe("getFileExtension", () => {
    it("extracts extension from a simple filename", () => {
      expect(getFileExtension("main.ts")).toBe("ts");
    });

    it("extracts extension from a path with forward slashes", () => {
      expect(getFileExtension("src/renderer/components/FileEditor.tsx")).toBe("tsx");
    });

    it("extracts extension from a Windows-style path with backslashes", () => {
      expect(getFileExtension("C:\\Users\\dev\\project\\main.rs")).toBe("rs");
    });

    it("extracts extension from a mixed separator path", () => {
      expect(getFileExtension("C:\\Users\\dev/project/file.go")).toBe("go");
    });

    it("returns empty string for files without extension", () => {
      expect(getFileExtension("Makefile")).toBe("");
    });

    it("returns empty string for dotfiles", () => {
      expect(getFileExtension(".gitignore")).toBe("");
    });

    it("handles dotfiles in Windows paths", () => {
      expect(getFileExtension("C:\\Users\\dev\\.env")).toBe("");
    });

    it("handles multiple dots correctly", () => {
      expect(getFileExtension("archive.test.ts")).toBe("ts");
    });

    it("normalizes to lowercase", () => {
      expect(getFileExtension("README.MD")).toBe("md");
    });

    it("returns empty string for empty path", () => {
      expect(getFileExtension("")).toBe("");
    });

    it("handles dots in directory names (Windows path)", () => {
      expect(getFileExtension("C:\\my.project\\src\\main.py")).toBe("py");
    });

    it("handles dots in directory names (Unix path)", () => {
      expect(getFileExtension("/home/user/my.project/src/main.py")).toBe("py");
    });
  });

  describe("isLanguageSupported", () => {
    it("returns true for supported extensions", () => {
      expect(isLanguageSupported("file.ts")).toBe(true);
      expect(isLanguageSupported("file.py")).toBe(true);
      expect(isLanguageSupported("file.rs")).toBe(true);
      expect(isLanguageSupported("file.go")).toBe(true);
      expect(isLanguageSupported("file.html")).toBe(true);
      expect(isLanguageSupported("file.css")).toBe(true);
      expect(isLanguageSupported("file.json")).toBe(true);
      expect(isLanguageSupported("file.yaml")).toBe(true);
    });

    it("returns false for unsupported extensions", () => {
      expect(isLanguageSupported("file.unknown")).toBe(false);
      expect(isLanguageSupported("file.xyz")).toBe(false);
    });

    it("returns false for files without extension", () => {
      expect(isLanguageSupported("Makefile")).toBe(false);
    });
  });

  describe("getSupportedExtensions", () => {
    it("returns a non-empty array", () => {
      const extensions = getSupportedExtensions();
      expect(extensions.length).toBeGreaterThan(0);
    });

    it("includes common extensions", () => {
      const extensions = getSupportedExtensions();
      expect(extensions).toContain("ts");
      expect(extensions).toContain("tsx");
      expect(extensions).toContain("js");
      expect(extensions).toContain("jsx");
      expect(extensions).toContain("py");
      expect(extensions).toContain("go");
      expect(extensions).toContain("rs");
      expect(extensions).toContain("html");
      expect(extensions).toContain("css");
      expect(extensions).toContain("json");
      expect(extensions).toContain("md");
      expect(extensions).toContain("yaml");
      expect(extensions).toContain("yml");
      expect(extensions).toContain("sql");
      expect(extensions).toContain("java");
      expect(extensions).toContain("cpp");
      expect(extensions).toContain("php");
      expect(extensions).toContain("xml");
    });
  });

  describe("getLanguageExtension", () => {
    it("returns null for unsupported file types", () => {
      expect(getLanguageExtension("file.unknown")).toBeNull();
    });

    it("returns null for files without extension", () => {
      expect(getLanguageExtension("Makefile")).toBeNull();
    });

    it("returns an extension for TypeScript files", () => {
      expect(getLanguageExtension("main.ts")).not.toBeNull();
    });

    it("returns an extension for Python files", () => {
      expect(getLanguageExtension("script.py")).not.toBeNull();
    });

    it("returns an extension for Go files", () => {
      expect(getLanguageExtension("main.go")).not.toBeNull();
    });

    it("returns an extension for Rust files", () => {
      expect(getLanguageExtension("lib.rs")).not.toBeNull();
    });

    it("resolves Windows-style paths correctly", () => {
      expect(getLanguageExtension("C:\\Users\\dev\\project\\main.go")).not.toBeNull();
    });
  });
});
