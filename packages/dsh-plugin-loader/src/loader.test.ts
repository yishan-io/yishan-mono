import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Context } from "@deepseek-ai/cordis";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadVerifiedPluginLock: vi.fn() }));
vi.mock("./lock", () => ({ loadVerifiedPluginLock: mocks.loadVerifiedPluginLock }));

import { mountLocalPluginLoader, mountVerifiedPluginLoader } from "./loader";
import type { PluginManifestEntry } from "./schema";
import { hashPluginTree } from "./tree";

async function createFixture(
  entrySource = "export default () => undefined\n",
): Promise<{ root: string; packageRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), "yishan-plugin-loader-"));
  const packageRoot = join(root, "package");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(root, "plugins.current"), "snapshot");
  await writeFile(join(packageRoot, "entry.mjs"), entrySource);
  return { root, packageRoot };
}

function entry(id: string, inject: PluginManifestEntry["inject"] = []): PluginManifestEntry {
  return { id, entrypoint: "entry.mjs", config: {}, disabled: false, inject };
}

function mockPackage(root: string, name: string, entries: PluginManifestEntry[]) {
  return { name, version: "1.0.0", root, entries };
}

afterEach(() => vi.resetAllMocks());

describe("mountVerifiedPluginLoader", () => {
  it("creates a signed-manifest entry and reports it loaded", async () => {
    const fixture = await createFixture();
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [mockPackage(fixture.packageRoot, "@deepseek-ai/dsh-llm-deepseek", [entry("official")])],
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

  it("loads entries from a Cordis plugin context without undeclared loader injection", async () => {
    const fixture = await createFixture();
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [mockPackage(fixture.packageRoot, "safe-plugin", [entry("official")])],
    });
    const context = new Context();
    let states: readonly { state: string }[] = [];
    try {
      await context.plugin(async (pluginContext) => {
        const mounted = await mountVerifiedPluginLoader(pluginContext, fixture.root);
        states = mounted.states;
      });
      expect(states).toEqual([expect.objectContaining({ state: "loaded" })]);
    } finally {
      await context.fiber.dispose();
    }
  });

  it("isolates an entry apply failure and reports it rejected", async () => {
    const fixture = await createFixture("export default () => { throw new Error('broken') }\n");
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [mockPackage(fixture.packageRoot, "@deepseek-ai/dsh-llm-deepseek", [entry("broken")])],
    });
    const context = new Context();
    try {
      const mounted = await mountVerifiedPluginLoader(context, fixture.root);
      expect(mounted.states[0]).toMatchObject({ packageName: "@deepseek-ai/dsh-llm-deepseek", state: "rejected" });
      await mounted.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("keeps entries from different packages isolated", async () => {
    const fixture = await createFixture();
    const rejectedRoot = join(fixture.root, "rejected-package");
    await mkdir(rejectedRoot);
    await writeFile(join(rejectedRoot, "entry.mjs"), "export default () => { throw new Error('broken') }\n");
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [
        mockPackage(fixture.packageRoot, "@a/b", [entry("shared")]),
        mockPackage(rejectedRoot, "a-b", [entry("shared")]),
      ],
    });
    const context = new Context();
    try {
      const mounted = await mountVerifiedPluginLoader(context, fixture.root);
      expect(mounted.states).toEqual([
        { id: "14-official%3Aa-b-shared", packageName: "a-b", state: "rejected" },
        { id: "19-official%3A%40a%2Fb-shared", packageName: "@a/b", state: "loaded" },
      ]);
      await mounted.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("uses the same entry format for official and developer plugins", async () => {
    const fixture = await createFixture();
    const localRoot = join(fixture.root, "local-bundle");
    await mkdir(localRoot);
    await writeFile(join(localRoot, "entry.mjs"), "export default () => undefined\n");
    await writeFile(
      join(fixture.root, "local-bundles.lock.json"),
      JSON.stringify({
        version: 1,
        bundles: [
          {
            id: "x",
            root: localRoot,
            treeSha256: (await hashPluginTree(localRoot)).sha256,
            entries: [entry("shared")],
          },
        ],
      }),
    );
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [mockPackage(fixture.packageRoot, "local-x", [entry("shared")])],
    });
    const context = new Context();
    try {
      const official = await mountVerifiedPluginLoader(context, fixture.root);
      const local = await mountLocalPluginLoader(context, fixture.root);
      expect(official.states[0]).toMatchObject({ packageName: "local-x", state: "loaded" });
      expect(local.states[0]).toMatchObject({ packageName: "x", state: "loaded" });
      await local.dispose();
      await official.dispose();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("rejects Yishan transport ownership without loading the entry", async () => {
    const fixture = await createFixture();
    mocks.loadVerifiedPluginLock.mockResolvedValue({
      root: fixture.root,
      snapshotRoot: fixture.root,
      packages: [mockPackage(fixture.packageRoot, "example", [entry("bridge", ["daemonBridge"])])],
    });
    const context = new Context();
    try {
      const mounted = await mountVerifiedPluginLoader(context, fixture.root);
      expect(mounted.states[0]).toMatchObject({ packageName: "example", state: "rejected" });
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
