import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadLocalPluginLock } from "./localLock";

describe("loadLocalPluginLock", () => {
  it("loads an explicitly registered developer bundle without an official signature", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-local-lock-"));
    const bundle = join(root, "bundle");
    await mkdir(bundle);
    await writeFile(join(bundle, "cordis.patch.yml"), "plugins: []\n");
    await writeFile(join(bundle, "entry.mjs"), "export default () => undefined\n");
    const crypto = await import("node:crypto");
    const hash = async (file: string) =>
      crypto
        .createHash("sha256")
        .update(await import("node:fs/promises").then(({ readFile }) => readFile(file)))
        .digest("hex");
    await writeFile(
      join(root, "local-bundles.lock.json"),
      JSON.stringify({
        version: 1,
        bundles: [
          {
            id: "example",
            root: bundle,
            files: [
              { path: "cordis.patch.yml", sha256: await hash(join(bundle, "cordis.patch.yml")) },
              { path: "entry.mjs", sha256: await hash(join(bundle, "entry.mjs")) },
            ],
          },
        ],
      }),
    );

    await expect(loadLocalPluginLock(root)).resolves.toMatchObject({
      bundles: [expect.objectContaining({ id: "example" })],
    });
  });

  it("rejects a changed or escaping developer bundle tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-local-lock-invalid-"));
    await writeFile(
      join(root, "local-bundles.lock.json"),
      JSON.stringify({ version: 1, bundles: [{ id: "example", root: "/tmp/../etc", files: [] }] }),
    );
    await expect(loadLocalPluginLock(root)).rejects.toThrow("local plugin lock");
  });
});
