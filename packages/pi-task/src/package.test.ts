import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const TOOL_NAMES = [
  "task_start",
  "task_list",
  "task_search",
  "task_read",
  "task_update",
  "task_write",
  "task_append_note",
  "task_finish",
  "task_template_read",
];
const SKILL_NAMES = ["context-task", "starting-task", "executing-plans", "finishing-task"];
const STALE_CALLER_PROVIDED_CREATION_ID =
  /(?:caller[- ]?(?:owned|provided|supplied|generated).{0,80}\b(?:creation|create|start|task)[ -]?id\b|\b(?:creation|create|start)\b.{0,80}\bcaller[- ]?(?:owned|provided|supplied|generated)\b.{0,80}\bid\b)/i;
const STALE_COMPLETED_TASK_FOLDER_MOVE =
  /(?:\b(?:move|moved|moves|moving)\b.{0,80}\b(?:completed[- ]?state|completed tasks?)\b.{0,80}\b(?:task )?folders?\b|\b(?:task )?folders?\b.{0,80}\b(?:move|moved|moves|moving)\b.{0,80}\bcompleted\b|\bcompleted[- ]?state\b.{0,80}\b(?:move|moved|moves|moving)\b.{0,80}\b(?:task )?folders?\b)/i;
const STALE_DATED_ENTRY_CLIENT_DATE =
  /(?:\b(?:client|local)[- ]?date\b.{0,80}\b(?:dated|date|entries?)\b|\bdated\b.{0,80}\bentries?\b.{0,80}\b(?:client|local)[- ]?date\b)/i;
const STALE_CALLER_SUPPLIED_ID = /\bID when one is supplied\b/i;
const STALE_COMPLETED_STATE_MOVE = /\b(?:moves an active task to completed state|performs the completed-state move)\b/i;
const STALE_DATED_ENTRY = /\bappends a dated entry\b/i;
const STALE_DOCUMENTATION = [
  /\.my-context\/tasks/i,
  /state\.json/i,
  /task\.md/i,
  /task[- ]file/i,
  /task folder/i,
  STALE_CALLER_PROVIDED_CREATION_ID,
  STALE_CALLER_SUPPLIED_ID,
  STALE_COMPLETED_TASK_FOLDER_MOVE,
  STALE_COMPLETED_STATE_MOVE,
  STALE_DATED_ENTRY_CLIENT_DATE,
  STALE_DATED_ENTRY,
];
const STALE_DOCUMENTATION_FIXTURES = [
  [STALE_CALLER_PROVIDED_CREATION_ID, "Pass a caller-provided creation ID to task_start."],
  [STALE_CALLER_SUPPLIED_ID, "The tool accepts an ID when one is supplied."],
  [STALE_COMPLETED_TASK_FOLDER_MOVE, "Move completed task folders after the task enters the completed state."],
  [STALE_COMPLETED_STATE_MOVE, "task_finish moves an active task to completed state."],
  [STALE_COMPLETED_STATE_MOVE, "task_finish performs the completed-state move."],
  [STALE_DATED_ENTRY_CLIENT_DATE, "Use the client date for dated task entries."],
  [STALE_DATED_ENTRY, "task_append_note appends a dated entry."],
] as const;

describe("pi-task package contract", () => {
  it("publishes the managed Local Task package contract", async () => {
    const manifest = JSON.parse(await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8")) as {
      description?: string;
      files: string[];
      engines?: { node?: string };
      keywords?: string[];
      pi: { skills?: string[] };
    };

    expect(manifest.description).toBe("Pi tools and workflow skills for SQLite-backed Local Tasks.");
    expect(manifest.engines?.node).toBe(">=22.4.0");
    expect(manifest.keywords).toEqual(["pi-package", "local-task", "sqlite"]);
    expect(manifest.pi.skills).toEqual(["./skills"]);
    expect(manifest.files).toContain("skills");
    await Promise.all(SKILL_NAMES.map((name) => access(resolve(PACKAGE_ROOT, "skills", name, "SKILL.md"))));
  });

  it("documents exactly nine tools and four consistent daemon-backed skills", async () => {
    const readme = await readFile(resolve(PACKAGE_ROOT, "README.md"), "utf8");
    const skillDirectory = resolve(PACKAGE_ROOT, "skills");
    const skillFiles = await readdir(skillDirectory, { withFileTypes: true });
    const skills = await Promise.all(
      SKILL_NAMES.map(async (name) => readFile(resolve(skillDirectory, name, "SKILL.md"), "utf8")),
    );

    expect(
      skillFiles
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual([...SKILL_NAMES].sort());
    const documentedToolNames = new Set(Array.from(readme.matchAll(/`(task_[a-z_]+)`/g), (match) => match[1]));
    expect(documentedToolNames).toEqual(new Set(TOOL_NAMES));
    for (const skill of skills) {
      expect(skill).toContain("SQLite-backed Local Task daemon");
      expect(skill).toContain("task_update");
      expect(skill).toContain("task_finish");
      expect(skill).toMatch(/only when the user explicitly/i);
    }
  });

  it("detects every stale authority instruction fixture", () => {
    for (const [pattern, fixture] of STALE_DOCUMENTATION_FIXTURES) {
      expect(fixture).toMatch(pattern);
    }
  });

  it("contains no legacy task authority instructions", async () => {
    const documents = await Promise.all([
      readFile(resolve(PACKAGE_ROOT, "README.md"), "utf8"),
      ...SKILL_NAMES.map((name) => readFile(resolve(PACKAGE_ROOT, "skills", name, "SKILL.md"), "utf8")),
    ]);

    for (const document of documents) {
      for (const stalePhrase of STALE_DOCUMENTATION) expect(document).not.toMatch(stalePhrase);
    }
  });
});
