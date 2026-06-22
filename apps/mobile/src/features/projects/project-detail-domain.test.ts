import { describe, expect, it } from "vitest";

import { buildProjectDetailRows, buildProjectDetailSummary } from "./project-detail-domain";
import type { Project } from "./projects.types";

const t = (key: string) => key;

const project: Project = {
  color: "#00FF00",
  contextEnabled: true,
  createdAt: "2026-06-16T00:00:00.000Z",
  createdByUserId: "user-1",
  icon: "rocket",
  id: "project-1",
  name: "Nile",
  organizationId: "org-1",
  postScript: "",
  repoKey: "nile",
  repoProvider: "github",
  repoUrl: "https://github.com/acme/nile",
  setupScript: "",
  sourceType: "git",
  updatedAt: "2026-06-16T00:00:00.000Z",
};

describe("project-detail-domain", () => {
  it("builds project detail rows from feature project data", () => {
    expect(buildProjectDetailRows(project, t)).toEqual([
      { label: "shell.repositoryUrl", value: "https://github.com/acme/nile" },
      { label: "shell.repositoryProvider", value: "github" },
      { label: "shell.repositoryKey", value: "nile" },
      { label: "shell.sourceType", value: "git" },
      { label: "shell.iconName", value: "rocket" },
      { label: "shell.hexColor", value: "#00FF00" },
      { label: "shell.contextEnabled", value: "common.enabled" },
    ]);
  });

  it("uses fallback values for empty project metadata", () => {
    expect(
      buildProjectDetailRows(
        {
          ...project,
          color: " ",
          icon: " ",
          repoKey: null,
          repoProvider: null,
          repoUrl: null,
          sourceType: " ",
        },
        t,
      ),
    ).toEqual([
      { label: "shell.repositoryUrl", value: "common.notSet" },
      { label: "shell.repositoryProvider", value: "common.notSet" },
      { label: "shell.repositoryKey", value: "common.notSet" },
      { label: "shell.sourceType", value: "common.notSet" },
      { label: "shell.iconName", value: "common.notSet" },
      { label: "shell.hexColor", value: "common.notSet" },
      { label: "shell.contextEnabled", value: "common.enabled" },
    ]);
  });

  it("derives project metadata summary from repo linkage", () => {
    expect(buildProjectDetailSummary(project, t)).toBe("shell.projectMetadataSummaryLinked");
    expect(buildProjectDetailSummary({ ...project, repoUrl: "   " }, t)).toBe("shell.projectMetadataSummaryUnlinked");
    expect(buildProjectDetailSummary(null, t)).toBeNull();
  });
});
