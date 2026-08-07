import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

const appRoot = import.meta.dirname;

/**
 * Vditor loads several runtime assets from its `cdn` base (icons, i18n,
 * highlight.js, mermaid). The editor factory sets `cdn: "./vditor"`, so these
 * assets must exist in the public dir — copy the pinned subset from
 * node_modules at dev/build start (mirrors the _lutePath localization and
 * keeps the editor usable offline / behind blocked CDNs).
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

function copyVditorCdnAssets(): Plugin {
  const vditorDist = path.resolve(appRoot, "node_modules/vditor/dist");
  const targetBase = path.resolve(appRoot, "src/renderer/public/vditor/dist");
  return {
    name: "vditor-cdn-assets",
    buildStart() {
      for (const rel of VDITOR_CDN_ASSETS) {
        const src = path.join(vditorDist, rel);
        const dest = path.join(targetBase, rel);
        mkdirSync(path.dirname(dest), { recursive: true });
        cpSync(src, dest);
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
