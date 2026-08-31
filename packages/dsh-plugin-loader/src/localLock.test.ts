import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadLocalPluginLock } from "./localLock";
import { hashPluginTree } from "./tree";

describe("loadLocalPluginLock", () => {
  it("loads an explicitly registered developer bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-local-lock-"));
    const bundle = join(root, "bundle");
    await mkdir(bundle);
    await writeFile(join(bundle, "entry.mjs"), "export default () => undefined\n");
    await writeFile(
      join(root, "local-bundles.lock.json"),
      JSON.stringify({
        version: 1,
        bundles: [
          {
            id: "example",
            root: bundle,
            treeSha256: (await hashPluginTree(bundle)).sha256,
            entries: [{ id: "main", entrypoint: "entry.mjs" }],
          },
        ],
      }),
    );

    await expect(loadLocalPluginLock(root)).resolves.toMatchObject({
      bundles: [{ id: "example", entries: [{ id: "main", entrypoint: "entry.mjs" }] }],
    });
  });

  it("rejects a changed developer bundle tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-local-lock-invalid-"));
    const bundle = join(root, "bundle");
    await mkdir(bundle);
    await writeFile(join(bundle, "entry.mjs"), "initial");
    const treeSha256 = (await hashPluginTree(bundle)).sha256;
    await writeFile(
      join(root, "local-bundles.lock.json"),
      JSON.stringify({
        version: 1,
        bundles: [{ id: "example", root: bundle, treeSha256, entries: [{ id: "main", entrypoint: "entry.mjs" }] }],
      }),
    );
    await writeFile(join(bundle, "entry.mjs"), "changed");

    await expect(loadLocalPluginLock(root)).rejects.toThrow("bundle tree changed");
  });
});
