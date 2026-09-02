import { describe, expect, it } from "vitest";

import { buildLegacyTaskPrefixCandidates } from "@/services/local-task-key-prefix";

describe("buildLegacyTaskPrefixCandidates", () => {
  it("creates deterministic valid candidates and resolves collisions with a different prefix", () => {
    const candidates = buildLegacyTaskPrefixCandidates("Project Atlas", "project-1");

    expect(candidates[0]).toBe("PROJE");
    expect(candidates).toEqual(buildLegacyTaskPrefixCandidates("Project Atlas", "project-1"));
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates.every((candidate) => /^[A-Z]{3,5}$/.test(candidate) && candidate !== "PERS")).toBe(true);
    expect(candidates[1]).not.toBe(candidates[0]);
  });

  it("uses a valid fallback for names without three ASCII letters", () => {
    expect(buildLegacyTaskPrefixCandidates("12", "project-1")[0]).toMatch(/^[A-Z]{3,5}$/);
  });
});
