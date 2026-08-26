import { lstat, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalTask, LocalTaskContextDetails } from "../backend/localTaskTypes";
import { createLocalTaskDocuments, validateContextDocumentPath } from "./taskDocuments";

let contextDirectory = "";

beforeEach(async () => {
  contextDirectory = await realpath(await mkdtemp(join(tmpdir(), "pi-local-task-context-")));
});
afterEach(async () => rm(contextDirectory, { recursive: true, force: true }));

describe("validateContextDocumentPath", () => {
  it("derives normalized absolute direct children from the daemon context directory", () => {
    expect(validateContextDocumentPath(contextDetails(), "plan")).toEqual({
      directory: contextDirectory,
      path: join(contextDirectory, "plan.md"),
    });
    expect(() => validateContextDocumentPath({ ...contextDetails(), directory: "relative" }, "plan")).toThrow(
      "Invalid Local Task context document path",
    );
    expect(() =>
      validateContextDocumentPath({ ...contextDetails(), directory: `${contextDirectory}\0` }, "plan"),
    ).toThrow("Invalid Local Task context document path");
  });
});

describe("LocalTaskDocuments", () => {
  it("scope-checks before requesting daemon context details", async () => {
    const metadata = {
      get: vi.fn().mockRejectedValue(new Error("Task does not belong to the configured project scope.")),
    };
    const backend = createBackend();
    const documents = createLocalTaskDocuments(metadata as never, backend as never);

    await expect(documents.read("other-project", "plan")).rejects.toThrow("configured project scope");
    expect(backend.getContextDetails).not.toHaveBeenCalled();
  });

  it("atomically writes and serializes concurrent appends", async () => {
    const documents = createDocuments();

    await documents.write("task-1", "plan", "first");
    await Promise.all([documents.appendNote("task-1", "one\n"), documents.appendNote("task-1", "two\n")]);

    await expect(readFile(join(contextDirectory, "plan.md"), "utf8")).resolves.toBe("first");
    await expect(readFile(join(contextDirectory, "notes.md"), "utf8")).resolves.toBe("one\ntwo\n");
    expect((await lstat(join(contextDirectory, "plan.md"))).isSymbolicLink()).toBe(false);
  });

  it("rejects symlinked directory ancestors before mkdir can escape the lexical path", async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), "pi-local-task-target-"));
    const linkDirectory = join(contextDirectory, "linked");
    const nestedDirectory = join(linkDirectory, "task");
    await symlink(targetDirectory, linkDirectory);

    await expect(createDocuments(contextDetails(nestedDirectory)).write("task-1", "plan", "blocked")).rejects.toThrow(
      "symbolic link",
    );
    await expect(lstat(join(targetDirectory, "task"))).rejects.toMatchObject({ code: "ENOENT" });
    await rm(targetDirectory, { recursive: true, force: true });
  });

  it("serializes concurrent appends from separate document instances", async () => {
    const firstDocuments = createDocuments();
    const secondDocuments = createDocuments();

    await Promise.all([firstDocuments.appendNote("task-1", "one\n"), secondDocuments.appendNote("task-1", "two\n")]);

    await expect(readFile(join(contextDirectory, "notes.md"), "utf8")).resolves.toBe("one\ntwo\n");
  });

  it("rejects detectable directory and document symlinks", async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), "pi-local-task-target-"));
    const linkDirectory = join(contextDirectory, "linked");
    await symlink(targetDirectory, linkDirectory);
    const documents = createDocuments(contextDetails(linkDirectory));
    await expect(documents.write("task-1", "plan", "blocked")).rejects.toThrow("symbolic link");

    const documentPath = join(contextDirectory, "plan.md");
    await symlink(join(targetDirectory, "plan.md"), documentPath);
    await expect(createDocuments().write("task-1", "plan", "blocked")).rejects.toThrow("symbolic link");
    await rm(targetDirectory, { recursive: true, force: true });
  });

  it("does not perform filesystem or RPC work when aborted before a finish phase", async () => {
    const controller = new AbortController();
    controller.abort();
    const backend = createBackend();
    const metadata = { get: vi.fn().mockResolvedValue(task()) };
    const documents = createLocalTaskDocuments(metadata as never, backend as never);

    await expect(documents.finish("task-1", "outcome", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(metadata.get).not.toHaveBeenCalled();
    expect(backend.getContextDetails).not.toHaveBeenCalled();
    expect(backend.update).not.toHaveBeenCalled();
  });

  it("writes outcome before completion, preserves it on completion failure, and retries safely", async () => {
    const backend = createBackend();
    backend.update.mockRejectedValueOnce(new Error("daemon offline"));
    const documents = createDocuments(undefined, backend);

    await expect(documents.finish("task-1", "saved outcome")).rejects.toThrow("Outcome was saved");
    await expect(readFile(join(contextDirectory, "outcome.md"), "utf8")).resolves.toBe("saved outcome");
    expect(backend.update).toHaveBeenCalledWith("task-1", { status: "done" });

    await expect(documents.finish("task-1", "repaired outcome")).resolves.toMatchObject({ status: "done" });
    await expect(readFile(join(contextDirectory, "outcome.md"), "utf8")).resolves.toBe("repaired outcome");
    expect(backend.update).toHaveBeenCalledTimes(2);
  });

  it("repairs the outcome without another status update for an already done task", async () => {
    const backend = createBackend();
    const metadata = { get: vi.fn().mockResolvedValue(task("done")) };
    const documents = createLocalTaskDocuments(metadata as never, backend as never);

    await expect(documents.finish("task-1", "repaired")).resolves.toMatchObject({ status: "done" });
    await expect(readFile(join(contextDirectory, "outcome.md"), "utf8")).resolves.toBe("repaired");
    expect(backend.update).not.toHaveBeenCalled();
  });

  it("does not call completion when the outcome write fails", async () => {
    await writeFile(join(contextDirectory, "outcome.md"), "old");
    const backend = createBackend();
    const documents = createDocuments(undefined, backend);
    await rm(contextDirectory, { recursive: true });
    await writeFile(contextDirectory, "not a directory");

    await expect(documents.finish("task-1", "new")).rejects.toThrow();
    expect(backend.update).not.toHaveBeenCalled();
  });
});

function createDocuments(details = contextDetails(), backend = createBackend()) {
  return createLocalTaskDocuments(
    { get: vi.fn().mockResolvedValue(task()) } as never,
    backendFor(details, backend) as never,
  );
}
function createBackend(): { getContextDetails: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } {
  return {
    getContextDetails: vi.fn().mockResolvedValue(contextDetails()),
    update: vi.fn().mockResolvedValue({ status: "done" }),
  };
}
function backendFor(details: LocalTaskContextDetails, backend: ReturnType<typeof createBackend>) {
  return { ...backend, getContextDetails: vi.fn().mockResolvedValue(details) };
}
function contextDetails(directory = contextDirectory): LocalTaskContextDetails {
  return { directory, files: [] };
}
function task(status: LocalTask["status"] = "progressing"): LocalTask {
  return {
    id: "task-1",
    projectId: null,
    title: "Task",
    description: "",
    status,
    priority: "medium",
    createdAt: "",
    updatedAt: "",
    completedAt: null,
    tags: [],
    tagRefs: [],
  };
}
