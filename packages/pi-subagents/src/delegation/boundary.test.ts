import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [join(dir, entry.name)]
        : [],
  );
}
function imports(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/(?:from\s*|import\s*\()(["'])([^"']+)\1/g)].map(
    (match) => match[2] ?? "",
  );
}
it("owns neutral execution without policy, delivery or UI dependencies", () => {
  for (const owner of ["index", "types", "agentManager", "agentRunner", "sessionFactory", "concurrencyQueue"]) {
    expect(existsSync(join(root, "delegation", `${owner}.ts`)), owner).toBe(true);
  }
  for (const file of sources(join(root, "delegation"))) {
    for (const specifier of imports(file)) {
      if (!specifier.startsWith(".")) continue;
      expect(
        resolve(dirname(file), specifier).startsWith(`${join(root, "delegation")}/`),
        `${file}: ${specifier}`,
      ).toBe(true);
    }
  }
});
it("normal consumers use the core barrel, not internals or raw-session compatibility helpers", () => {
  for (const file of sources(root)) {
    if (
      file.includes("/delegation/") ||
      file.endsWith("/runtime/agentRunner.ts") ||
      file.endsWith("/runtime/sessionFactory.ts") ||
      file.endsWith("/index.ts")
    )
      continue;
    for (const specifier of imports(file)) {
      expect(specifier, file).not.toMatch(/delegation\//);
      expect(specifier, file).not.toMatch(/runtime\/(agentRunner|sessionFactory|agentManager)/);
    }
  }
});
