import { describe, expect, it } from "vitest";
import {
  getFileExtension,
  getLanguageId,
  getSupportedExtensions,
  isAudioFile,
  isLanguageSupported,
  isUnsupportedFileTab,
  isVideoFile,
} from "./editorLanguage";

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

  describe("isVideoFile", () => {
    it("returns true for common video extensions", () => {
      expect(isVideoFile("video.mp4")).toBe(true);
      expect(isVideoFile("clip.mov")).toBe(true);
      expect(isVideoFile("movie.mkv")).toBe(true);
      expect(isVideoFile("stream.webm")).toBe(true);
      expect(isVideoFile("recording.avi")).toBe(true);
    });

    it("returns true for Windows-style video paths", () => {
      expect(isVideoFile("C:\\Users\\videos\\demo.mp4")).toBe(true);
    });

    it("returns false for non-video files", () => {
      expect(isVideoFile("image.png")).toBe(false);
      expect(isVideoFile("song.mp3")).toBe(false);
      expect(isVideoFile("readme.md")).toBe(false);
    });

    it("returns false for files without extension", () => {
      expect(isVideoFile("video")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isVideoFile("VIDEO.MP4")).toBe(true);
    });
  });

  describe("isAudioFile", () => {
    it("returns true for common audio extensions", () => {
      expect(isAudioFile("song.mp3")).toBe(true);
      expect(isAudioFile("audio.wav")).toBe(true);
      expect(isAudioFile("track.flac")).toBe(true);
      expect(isAudioFile("podcast.aac")).toBe(true);
      expect(isAudioFile("sound.ogg")).toBe(true);
    });

    it("returns true for Windows-style audio paths", () => {
      expect(isAudioFile("C:\\Users\\music\\song.mp3")).toBe(true);
    });

    it("returns false for non-audio files", () => {
      expect(isAudioFile("video.mp4")).toBe(false);
      expect(isAudioFile("image.png")).toBe(false);
      expect(isAudioFile("readme.md")).toBe(false);
    });

    it("returns false for files without extension", () => {
      expect(isAudioFile("music")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isAudioFile("SONG.MP3")).toBe(true);
    });
  });

  describe("media extensions are not unsupported", () => {
    it("video extensions are not treated as unsupported", () => {
      expect(isUnsupportedFileTab("video.mp4")).toBe(false);
      expect(isUnsupportedFileTab("clip.mov")).toBe(false);
      expect(isUnsupportedFileTab("movie.mkv")).toBe(false);
      expect(isUnsupportedFileTab("stream.webm")).toBe(false);
    });

    it("audio extensions are not treated as unsupported", () => {
      expect(isUnsupportedFileTab("song.mp3")).toBe(false);
      expect(isUnsupportedFileTab("audio.wav")).toBe(false);
      expect(isUnsupportedFileTab("track.flac")).toBe(false);
      expect(isUnsupportedFileTab("sound.ogg")).toBe(false);
    });
  });

  describe("getLanguageId", () => {
    it("returns null for unsupported file types", () => {
      expect(getLanguageId("file.unknown")).toBeNull();
    });

    it("returns null for files without extension", () => {
      expect(getLanguageId("Makefile")).toBeNull();
    });

    it("returns 'typescript' for TypeScript files", () => {
      expect(getLanguageId("main.ts")).toBe("typescript");
    });

    it("returns 'typescript' for TSX files", () => {
      expect(getLanguageId("app.tsx")).toBe("typescript");
    });

    it("returns 'javascript' for JS files", () => {
      expect(getLanguageId("index.js")).toBe("javascript");
    });

    it("returns 'javascript' for JSX files", () => {
      expect(getLanguageId("component.jsx")).toBe("javascript");
    });

    it("returns 'python' for Python files", () => {
      expect(getLanguageId("script.py")).toBe("python");
    });

    it("returns 'go' for Go files", () => {
      expect(getLanguageId("main.go")).toBe("go");
    });

    it("returns 'rust' for Rust files", () => {
      expect(getLanguageId("lib.rs")).toBe("rust");
    });

    it("returns 'html' for HTML files", () => {
      expect(getLanguageId("index.html")).toBe("html");
    });

    it("returns 'json' for JSON files", () => {
      expect(getLanguageId("package.json")).toBe("json");
    });

    it("returns 'markdown' for Markdown files", () => {
      expect(getLanguageId("README.md")).toBe("markdown");
    });

    it("resolves Windows-style paths correctly", () => {
      expect(getLanguageId("C:\\Users\\dev\\project\\main.go")).toBe("go");
    });
  });
});
