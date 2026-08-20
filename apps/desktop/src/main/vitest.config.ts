import { defineConfig } from "vitest/config";
/** Main-process Vitest configuration, usable with `vitest --root src/main`. */
export default defineConfig({
  resolve: { alias: { "@shared": new URL("../shared", import.meta.url).pathname } },
  test: { environment: "node", include: ["**/*.test.ts"] },
});
