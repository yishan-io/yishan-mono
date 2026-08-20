import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyFiles, resolveRealPath, writeFileBase64 } from "./fileSystemOperations";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "yishan-file-operations-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("fileSystemOperations", () => {
  it("keeps an unresolved path and copies both files and directories", async () => {
    const directory = await createTemporaryDirectory();
    const sourceFile = join(directory, "source.txt");
    const sourceDirectory = join(directory, "source-directory");
    const destinationDirectory = join(directory, "destination");
    await writeFile(sourceFile, "file");
    await mkdir(sourceDirectory);
    await writeFile(join(sourceDirectory, "nested.txt"), "directory");

    await expect(resolveRealPath(join(directory, "missing"))).resolves.toEqual({ path: join(directory, "missing") });
    await expect(copyFiles({ sourcePaths: [sourceFile, sourceDirectory], destinationDirectory })).resolves.toEqual({
      ok: true,
      copiedPaths: [join(destinationDirectory, "source.txt"), join(destinationDirectory, "source-directory")],
    });
    await expect(readFile(join(destinationDirectory, "source.txt"), "utf8")).resolves.toBe("file");
    await expect(readFile(join(destinationDirectory, "source-directory", "nested.txt"), "utf8")).resolves.toBe(
      "directory",
    );
  });

  it("reports invalid copy inputs and write failures without throwing", async () => {
    await expect(copyFiles({})).resolves.toEqual({ ok: false, error: "sourcePaths is required" });
    await expect(writeFileBase64({ absolutePath: "/", contentBase64: "dGVzdA==" })).resolves.toMatchObject({
      ok: false,
    });
  });
});
