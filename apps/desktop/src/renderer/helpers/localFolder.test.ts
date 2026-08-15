import { describe, expect, it } from "vitest";
import { isFolderWorkspace } from "./localFolder";

describe("isFolderWorkspace", () => {
  it("returns true for a workspace with kind folder", () => {
    expect(isFolderWorkspace({ kind: "folder", projectId: "anything" })).toBe(true);
  });

  it("returns true for a workspace with the local-folder sentinel project id", () => {
    expect(isFolderWorkspace({ projectId: "local-folder" })).toBe(true);
  });

  it("returns true when kind is folder even without projectId", () => {
    expect(isFolderWorkspace({ kind: "folder" })).toBe(true);
  });

  it("returns false for a managed workspace with no project", () => {
    expect(isFolderWorkspace({ kind: "managed", projectId: "repo-1" })).toBe(false);
  });

  it("returns false for null / undefined", () => {
    expect(isFolderWorkspace(null)).toBe(false);
    expect(isFolderWorkspace(undefined)).toBe(false);
  });

  it("returns false for a local (non-folder) workspace", () => {
    expect(isFolderWorkspace({ kind: "local", projectId: "repo-1" })).toBe(false);
  });
});
