import { describe, expect, it } from "vitest";
import type { ProjectCommitComparisonFile } from "../../../components/ProjectCommitComparison";
import { buildAllCommitChangesSection, buildCommitChangesSection, toCommitFile } from "./changesTabHelpers";

describe("toCommitFile", () => {
  it("passes through a typed file object unchanged", () => {
    const f: ProjectCommitComparisonFile = { path: "src/a.ts", status: "A" };
    expect(toCommitFile(f)).toEqual({ path: "src/a.ts", status: "A" });
  });

  it("coerces a plain string (old daemon) to a file with status M", () => {
    expect(toCommitFile("src/a.ts")).toEqual({ path: "src/a.ts", status: "M" });
  });

  it("returns empty path for unexpected input", () => {
    expect(toCommitFile(null)).toEqual({ path: "", status: "M" });
    expect(toCommitFile(42)).toEqual({ path: "", status: "M" });
  });
});

describe("buildCommitChangesSection", () => {
  it("maps A→added, D→deleted, R→renamed, M→modified", () => {
    const section = buildCommitChangesSection({
      hash: "abc",
      shortHash: "abc1234",
      authorName: "Dev",
      committedAt: "2026-01-01T00:00:00Z",
      subject: "test",
      changedFiles: [
        { path: "added.ts", status: "A" },
        { path: "deleted.ts", status: "D" },
        { path: "renamed.ts", status: "R" },
        { path: "modified.ts", status: "M" },
        { path: "other.ts", status: "T" },
      ],
    });
    const kindByPath = Object.fromEntries(section.files.map((f) => [f.path, f.kind]));
    expect(kindByPath["added.ts"]).toBe("added");
    expect(kindByPath["deleted.ts"]).toBe("deleted");
    expect(kindByPath["renamed.ts"]).toBe("renamed");
    expect(kindByPath["modified.ts"]).toBe("modified");
    expect(kindByPath["other.ts"]).toBe("modified");
  });

  it("deduplicates paths", () => {
    const section = buildCommitChangesSection({
      hash: "abc",
      shortHash: "abc1234",
      authorName: "Dev",
      committedAt: "2026-01-01T00:00:00Z",
      subject: "test",
      changedFiles: [
        { path: "src/a.ts", status: "M" },
        { path: "src/a.ts", status: "A" },
      ],
    });
    expect(section.files.length).toBe(1);
    expect(section.files[0]?.path).toBe("src/a.ts");
  });
});

describe("buildAllCommitChangesSection", () => {
  it("uses uncommittedKindByPath when present, falls back to status letter", () => {
    const uncommittedKinds = new Map([["src/a.ts", "deleted" as const]]);
    const section = buildAllCommitChangesSection(
      [
        { path: "src/a.ts", status: "M" },
        { path: "src/b.ts", status: "A" },
      ],
      uncommittedKinds,
    );
    const kindByPath = Object.fromEntries(section.files.map((f) => [f.path, f.kind]));
    expect(kindByPath["src/a.ts"]).toBe("deleted"); // uncommitted kind wins
    expect(kindByPath["src/b.ts"]).toBe("added"); // status letter used
  });
});
