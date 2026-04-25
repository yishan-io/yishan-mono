import { describe, expect, it } from "vitest";
import { normalizeCreateRepoInput, readPersistedDisplayRepoIds } from "./projectHelpers";

describe("projectHelpers", () => {
  it("normalizes create-repo input based on source", () => {
    expect(
      normalizeCreateRepoInput({
        source: "local",
        path: "  /tmp/repo  ",
        gitUrl: "  https://example.com/repo.git  ",
      }),
    ).toEqual({
      normalizedPath: "/tmp/repo",
      normalizedGitUrl: "https://example.com/repo.git",
      resolvedPath: "/tmp/repo",
    });

    expect(
      normalizeCreateRepoInput({
        source: "remote",
        path: "  /fallback/path  ",
        gitUrl: " https://example.com/repo.git ",
      }),
    ).toEqual({
      normalizedPath: "/fallback/path",
      normalizedGitUrl: "https://example.com/repo.git",
      resolvedPath: "https://example.com/repo.git",
    });
  });

  it("reads persisted display repo ids and ignores invalid payloads", () => {
    const storage = {
      getItem: () => JSON.stringify({ state: { displayProjectIds: ["repo-1", "repo-2", 3] } }),
    } as unknown as Storage;

    expect(readPersistedDisplayRepoIds(storage)).toEqual(["repo-1", "repo-2"]);

    const invalidStorage = {
      getItem: () => "not json",
    } as unknown as Storage;

    expect(readPersistedDisplayRepoIds(invalidStorage)).toBeUndefined();
  });
});
