import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadVerifiedPluginLock } from "./lock";

type Fixture = { root: string; packageRoot: string };

async function createFixture(
  options: {
    publisher?: string;
    enabled?: boolean;
    manifestHash?: string;
  } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "yishan-plugin-lock-"));
  const snapshot = "snapshot-1";
  const packageName = options.publisher ?? "@deepseek-ai/dsh-llm-deepseek";
  const packageRoot = join(root, ".plugin-snapshots", snapshot, "plugins", packageName);
  await mkdir(packageRoot, { recursive: true });
  const manifest = '{"version":"1","plugins":[]}';
  await writeFile(join(packageRoot, "entry.mjs"), "export default () => undefined\n");
  await writeFile(join(packageRoot, "yishan.adaptation.json"), manifest);
  const files = await getFiles(packageRoot, ["entry.mjs", "yishan.adaptation.json"]);
  const adaptationSha256 = options.manifestHash ?? createHash("sha256").update(manifest).digest("hex");
  const treeSha256 = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  const inventory = {
    version: 1,
    plugins: [
      {
        name: packageName,
        version: "0.1.1-rc.2",
        enabled: options.enabled ?? true,
        treeSha256,
        files,
        adaptationVersion: "1",
        adaptationSha256,
      },
    ],
  };
  const content = Buffer.from(JSON.stringify(inventory));
  const keys = generateKeyPairSync("ed25519");
  const privateDer = keys.privateKey.export({
    format: "der",
    type: "pkcs8",
  }) as Buffer;
  const publicDer = keys.publicKey.export({
    format: "der",
    type: "spki",
  }) as Buffer;
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
  return { root, packageRoot };
}

async function getFiles(root: string, paths: string[]) {
  return await Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex"),
    })),
  );
}

describe("loadVerifiedPluginLock", () => {
  it("accepts a canonical daemon signature and rehashed official package tree", async () => {
    const fixture = await createFixture();
    await expect(loadVerifiedPluginLock(fixture.root)).resolves.toMatchObject({
      packages: [
        {
          name: "@deepseek-ai/dsh-llm-deepseek",
          files: [{ path: "entry.mjs" }, { path: "yishan.adaptation.json" }],
        },
      ],
    });
  });

  it("does not load a disabled signed bundle", async () => {
    const fixture = await createFixture({ enabled: false });
    await expect(loadVerifiedPluginLock(fixture.root)).resolves.toMatchObject({
      packages: [],
    });
  });

  it("rejects an adaptation manifest whose lock binding does not match its hash", async () => {
    const fixture = await createFixture({ manifestHash: "0".repeat(64) });
    await expect(loadVerifiedPluginLock(fixture.root)).rejects.toThrow("audited adaptation manifest binding mismatch");
  });

  it("rejects package content changed after the lock was signed", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.packageRoot, "entry.mjs"), "modified");
    await expect(loadVerifiedPluginLock(fixture.root)).rejects.toThrow("package tree mismatch");
  });

  it("does not hardcode legacy non-bundle adapters", async () => {
    const fixture = await createFixture({
      publisher: "@example/audited-bundle",
    });
    await expect(loadVerifiedPluginLock(fixture.root)).resolves.toMatchObject({
      packages: [{ name: "@example/audited-bundle" }],
    });
  });
});
