import path from "node:path";
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const appRoot = import.meta.dirname;
const require = createRequire(import.meta.url);

/**
 * Vditor loads several runtime assets from its `cdn` base (icons, i18n,
 * highlight.js, mermaid). The editor factory sets `cdn: "./vditor"`, so these
 * assets must exist in the public dir — copy the pinned subset from the
 * installed vditor package at dev/build start (mirrors the _lutePath
 * localization and keeps the editor usable offline / behind blocked CDNs).
 *
 * Resolves vditor via require.resolve so it works under both bun's symlink
 * store and CI's `--linker hoisted` layout, and never fails the build when
 * the package (or a single asset) is missing.
 */
const VDITOR_CDN_ASSETS = [
  "js/icons/ant.js",
  "js/i18n/en_US.js",
  "js/i18n/zh_CN.js",
  "js/highlight.js/highlight.min.js",
  "js/highlight.js/third-languages.js",
  "js/highlight.js/styles/github.min.css",
  "js/highlight.js/styles/github-dark.min.css",
  "js/mermaid/mermaid.min.js",
];

function resolveVditorDist(): string | null {
  try {
    const pkgPath = require.resolve("vditor/package.json", { paths: [appRoot] });
    return path.join(path.dirname(pkgPath), "dist");
  } catch {
    return null;
  }
}

function copyVditorCdnAssets(): Plugin {
  const targetBase = path.resolve(appRoot, "src/renderer/public/vditor/dist");
  return {
    name: "vditor-cdn-assets",
    buildStart() {
      // Vitest loads this config too — tests don't need the runtime assets.
      if (process.env.VITEST) {
        return;
      }

      const vditorDist = resolveVditorDist();
      if (!vditorDist) {
        console.warn("[vditor-cdn-assets] vditor package not found; skipping asset copy");
        return;
      }

      for (const rel of VDITOR_CDN_ASSETS) {
        const src = path.join(vditorDist, rel);
        const dest = path.join(targetBase, rel);
        try {
          mkdirSync(path.dirname(dest), { recursive: true });
          cpSync(src, dest);
        } catch (error) {
          console.warn(
            `[vditor-cdn-assets] failed to copy ${rel}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyVditorCdnAssets()],
  root: path.resolve(appRoot, "src/renderer"),
  base: "./",
  build: {
    outDir: path.resolve(appRoot, "dist/renderer"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@renderer": path.resolve(appRoot, "src/renderer"),
      "@shared": path.resolve(appRoot, "src/shared"),
      "@pi-lsp": path.resolve(appRoot, "../../packages/pi-lsp/src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
