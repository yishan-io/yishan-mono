import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHash } from "node:crypto";
import { Context } from "@deepseek-ai/cordis";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadVerifiedPluginLock: vi.fn() }));
vi.mock("./lock", () => ({ loadVerifiedPluginLock: mocks.loadVerifiedPluginLock }));

import { mountLocalPluginLoader, mountVerifiedPluginLoader } from "./loader";

async function createPatchFixture(
  manifest: string,
  entrySource = "export default () => undefined\n",
): Promise<{ root: string; packageRoot: string; manifest: string }> {
  const root = await mkdtemp(join(tmpdir(), "yishan-plugin-loader-"));
  const packageRoot = join(root, "package");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(root, "plugins.current"), "snapshot");
  await writeFile(join(packageRoot, "entry.mjs"), entrySource);
  await writeFile(join(packageRoot, "yishan.adaptation.json"), manifest);
  return { root, packageRoot, manifest };
}

afterEach(() => vi.resetAllMocks());

describe("mountVerifiedPluginLoader", () => {
  it("creates a validated entry through the official loader and reports it loaded", async () => {
    const fixture = await createPatchFixture('{"version":"1","plugins":[{"id":"official","name":"./entry.mjs"}]}');
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [
        {
          name: "@deepseek-ai/dsh-llm-deepseek",
          root: fixture.packageRoot,
          files: [{ path: "yishan.adaptation.json" }, { path: "entry.mjs" }],
          adaptation: { version: "1", sha256: createHash("sha256").update(fixture.manifest).digest("hex") },
        },
      ],
    });
    const context = new Context();
    try {
      const mounted = await mountVerifiedPluginLoader(context, fixture.root);
      expect(mounted.states).toEqual([
        {
          id: "44-official%3A%40deepseek-ai%2Fdsh-llm-deepseek-official",
          packageName: "@deepseek-ai/dsh-llm-deepseek",
          state: "loaded",
        },
      ]);
      await mounted.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("isolates an entry apply failure and reports it rejected", async () => {
    const fixture = await createPatchFixture(
      '{"version":"1","plugins":[{"id":"broken","name":"./entry.mjs"}]}',
      "export default () => { throw new Error('broken') }\n",
    );
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [
        {
          name: "@deepseek-ai/dsh-llm-deepseek",
          root: fixture.packageRoot,
          files: [{ path: "yishan.adaptation.json" }, { path: "entry.mjs" }],
          adaptation: { version: "1", sha256: createHash("sha256").update(fixture.manifest).digest("hex") },
        },
      ],
    });
    const context = new Context();
    try {
      const mounted = await mountVerifiedPluginLoader(context, fixture.root);
      expect(mounted.states).toEqual([
        {
          id: "44-official%3A%40deepseek-ai%2Fdsh-llm-deepseek-broken",
          packageName: "@deepseek-ai/dsh-llm-deepseek",
          state: "rejected",
        },
      ]);
      await mounted.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("keeps a valid cross-package entry when a colliding legacy ID is rejected", async () => {
    const manifest = '{"version":"1","plugins":[{"id":"shared","name":"./entry.mjs"}]}';
    const fixture = await createPatchFixture(manifest);
    const rejectedPackageRoot = join(fixture.root, "rejected-package");
    await mkdir(rejectedPackageRoot);
    await writeFile(join(rejectedPackageRoot, "entry.mjs"), "export default () => { throw new Error('broken') }\n");
    await writeFile(join(rejectedPackageRoot, "yishan.adaptation.json"), manifest);
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [
        {
          name: "@a/b",
          root: fixture.packageRoot,
          files: [{ path: "yishan.adaptation.json" }, { path: "entry.mjs" }],
          adaptation: { version: "1", sha256: createHash("sha256").update(manifest).digest("hex") },
        },
        {
          name: "a-b",
          root: rejectedPackageRoot,
          files: [{ path: "yishan.adaptation.json" }, { path: "entry.mjs" }],
          adaptation: { version: "1", sha256: createHash("sha256").update(manifest).digest("hex") },
        },
      ],
    });
    const context = new Context();
    try {
      const mounted = await mountVerifiedPluginLoader(context, fixture.root);
      const validId = "19-official%3A%40a%2Fb-shared";
      const rejectedId = "14-official%3Aa-b-shared";
      expect(mounted.states).toEqual([
        { id: rejectedId, packageName: "a-b", state: "rejected" },
        { id: validId, packageName: "@a/b", state: "loaded" },
      ]);
      expect(context.loader.resolve(validId).options.name).toBe(join(fixture.packageRoot, "entry.mjs"));
      expect(() => context.loader.resolve(rejectedId)).toThrow();
      await mounted.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("keeps official and developer entries with colliding legacy IDs isolated", async () => {
    const manifest = '{"version":"1","plugins":[{"id":"shared","name":"./entry.mjs"}]}';
    const fixture = await createPatchFixture(manifest);
    const localBundleRoot = join(fixture.root, "local-bundle");
    const localPatch = "plugins:\n  - id: shared\n    name: ./entry.mjs\n";
    const localEntry = "export default () => undefined\n";
    await mkdir(localBundleRoot);
    await writeFile(join(localBundleRoot, "cordis.patch.yml"), localPatch);
    await writeFile(join(localBundleRoot, "entry.mjs"), localEntry);
    await writeFile(
      join(fixture.root, "local-bundles.lock.json"),
      JSON.stringify({
        version: 1,
        bundles: [
          {
            id: "x",
            root: localBundleRoot,
            files: [
              { path: "cordis.patch.yml", sha256: createHash("sha256").update(localPatch).digest("hex") },
              { path: "entry.mjs", sha256: createHash("sha256").update(localEntry).digest("hex") },
            ],
          },
        ],
      }),
    );
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [
        {
          name: "local-x",
          root: fixture.packageRoot,
          files: [{ path: "yishan.adaptation.json" }, { path: "entry.mjs" }],
          adaptation: { version: "1", sha256: createHash("sha256").update(manifest).digest("hex") },
        },
      ],
    });
    const context = new Context();
    try {
      const official = await mountVerifiedPluginLoader(context, fixture.root);
      const local = await mountLocalPluginLoader(context, fixture.root);
      expect(official.states).toEqual([
        { id: "18-official%3Alocal-x-shared", packageName: "local-x", state: "loaded" },
      ]);
      expect(local.states).toEqual([{ id: "9-local%3Ax-shared", packageName: "x", state: "loaded" }]);
      expect(context.loader.resolve(official.states[0]?.id ?? "").options.name).toBe(
        join(fixture.packageRoot, "entry.mjs"),
      );
      expect(context.loader.resolve(local.states[0]?.id ?? "")).toBeDefined();
      await local.dispose();
      await official.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("rejects MCP transport ownership without loading the entry", async () => {
    const fixture = await createPatchFixture(
      '{"version":"1","plugins":[{"id":"mcp","name":"./entry.mjs","inject":["mcp"]}]}',
    );
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [
        {
          name: "@deepseek-ai/dsh-llm-deepseek",
          root: fixture.packageRoot,
          files: [{ path: "yishan.adaptation.json" }, { path: "entry.mjs" }],
          adaptation: { version: "1", sha256: createHash("sha256").update(fixture.manifest).digest("hex") },
        },
      ],
    });
    const context = new Context();
    try {
      const mounted = await mountVerifiedPluginLoader(context, fixture.root);
      expect(mounted.states).toEqual([
        {
          id: "44-official%3A%40deepseek-ai%2Fdsh-llm-deepseek-mcp",
          packageName: "@deepseek-ai/dsh-llm-deepseek",
          state: "rejected",
        },
      ]);
      await mounted.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("does not mount a loader when no daemon snapshot exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "yishan-plugin-loader-empty-"));
    const context = new Context();
    try {
      await expect(mountVerifiedPluginLoader(context, root)).resolves.toMatchObject({ states: [] });
      expect(mocks.loadVerifiedPluginLock).not.toHaveBeenCalled();
      expect(context.get("loader")).toBeUndefined();
    } finally {
      await context.fiber.dispose();
    }
  });
});
