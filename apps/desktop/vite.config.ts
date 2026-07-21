import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
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
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
