import { generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadVerifiedPluginLock } from "./lock";
import { hashPluginTree } from "./tree";

type Fixture = { root: string; packageRoot: string; snapshotRoot: string };

async function createFixture(
  options: { packageName?: string; enabled?: boolean; entrypoint?: string } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "yishan-plugin-lock-"));
  const snapshot = "snapshot-1";
  const packageName = options.packageName ?? "@deepseek-ai/dsh-llm-deepseek";
  const packageRoot = join(root, ".plugin-snapshots", snapshot, "plugins", packageName);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "entry.mjs"), "export default () => undefined\n");
  const treeSha256 = (await hashPluginTree(packageRoot)).sha256;
  const inventory = {
    version: 1,
    plugins: [
      {
        name: packageName,
        version: "0.1.1-rc.2",
        enabled: options.enabled ?? true,
        treeSha256,
        entries: [
          {
            id: "main",
            entrypoint: options.entrypoint ?? "entry.mjs",
            config: {},
            disabled: false,
            inject: [],
          },
        ],
      },
    ],
  };
  const content = Buffer.from(JSON.stringify(inventory));
  const keys = generateKeyPairSync("ed25519");
  const privateDer = keys.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const publicDer = keys.publicKey.export({ format: "der", type: "spki" }) as Buffer;
  await writeFile(
    join(root, ".plugins.signing-key"),
    Buffer.concat([privateDer.subarray(-32), publicDer.subarray(-32)]),
  );
  await writeFile(join(root, "plugins.current"), snapshot);
  await writeFile(join(root, ".plugin-snapshots", snapshot, "plugins.lock.json"), content);
  await writeFile(
    join(root, ".plugin-snapshots", snapshot, "plugins.lock.sig"),
    sign(null, content, keys.privateKey).toString("base64"),
  );
  return { root, packageRoot, snapshotRoot: join(root, ".plugin-snapshots", snapshot) };
}

describe("loadVerifiedPluginLock", () => {
  it("accepts a signed snapshot and rehashed package tree", async () => {
    const fixture = await createFixture();
    await expect(loadVerifiedPluginLock(fixture.root)).resolves.toMatchObject({
      packages: [
        {
          name: "@deepseek-ai/dsh-llm-deepseek",
          entries: [{ id: "main", entrypoint: "entry.mjs" }],
        },
      ],
    });
  });

  it("does not load a disabled signed bundle", async () => {
    const fixture = await createFixture({ enabled: false });
    await expect(loadVerifiedPluginLock(fixture.root)).resolves.toMatchObject({ packages: [] });
  });

  it("rejects an entrypoint absent from the signed package tree", async () => {
    const fixture = await createFixture({ entrypoint: "missing.mjs" });
    await expect(loadVerifiedPluginLock(fixture.root)).rejects.toThrow("entrypoint is not in package tree");
  });

  it("rejects signed inventory tampering", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.snapshotRoot, "plugins.lock.json"), '{"version":1,"plugins":[]}');
    await expect(loadVerifiedPluginLock(fixture.root)).rejects.toThrow("invalid inventory signature");
  });

  it("rejects package content changed after signing", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.packageRoot, "entry.mjs"), "modified");
    await expect(loadVerifiedPluginLock(fixture.root)).rejects.toThrow("package tree mismatch");
  });

  it("accepts any signed npm package identity", async () => {
    const fixture = await createFixture({ packageName: "@example/audited-bundle" });
    await expect(loadVerifiedPluginLock(fixture.root)).resolves.toMatchObject({
      packages: [{ name: "@example/audited-bundle" }],
    });
  });
});
