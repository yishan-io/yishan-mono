import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createInjectedMemoryContextBuilder } from "./buildInjectedMemoryContext";

describe("createInjectedMemoryContextBuilder", () => {
  let tempRoot: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "pi-memory-context-"));
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("builds persona and project memory context", () => {
    const projectRoot = join(tempRoot, "project");
    mkdirSync(projectRoot, { recursive: true });

    const contextRoot = join(tempRoot, "contexts", "project");
    mkdirSync(join(contextRoot, "architecture"), { recursive: true });
    writeFileSync(
      join(contextRoot, "MEMORY.md"),
      "# Project Memory\n\n## Locked Decisions\n- 2026-07-10 - Use hybrid backend. Why: reuse CLI.\n",
    );
    writeFileSync(join(contextRoot, "architecture", "flow.md"), "# flow\n");
    symlinkSync(contextRoot, join(projectRoot, ".my-context"));

    const personaPath = join(tempRoot, "persona", "PERSONA.md");
    mkdirSync(join(tempRoot, "persona"), { recursive: true });
    writeFileSync(personaPath, "# Developer Persona\n\n- Prefers concise answers\n");

    const builder = createInjectedMemoryContextBuilder({
      personaPath,
    });

    const result = builder.build({ projectRoot });
    expect(result).toContain("## Developer Persona (.yishan/memory/PERSONA.md)");
    expect(result).toContain("Prefers concise answers");
    expect(result).toContain("## Personal Project Context (.my-context/)");
    expect(result).toContain(".my-context/architecture/");
    expect(result).toContain("Current session memory (.my-context/MEMORY.md)");
    expect(result).toContain("Use hybrid backend");
  });

  it("omits persona under remote host policy", () => {
    process.env.YISHAN_REMOTE_HOST_POLICY = "1";

    const projectRoot = join(tempRoot, "project");
    mkdirSync(projectRoot, { recursive: true });
    const contextRoot = join(tempRoot, "contexts", "project");
    mkdirSync(contextRoot, { recursive: true });
    writeFileSync(join(contextRoot, "MEMORY.md"), "# Project Memory\n");
    symlinkSync(contextRoot, join(projectRoot, ".my-context"));

    const personaPath = join(tempRoot, "persona", "PERSONA.md");
    mkdirSync(join(tempRoot, "persona"), { recursive: true });
    writeFileSync(personaPath, "# Developer Persona\n");

    const builder = createInjectedMemoryContextBuilder({ personaPath });
    const result = builder.build({ projectRoot });

    expect(result).not.toContain("## Developer Persona (.yishan/memory/PERSONA.md)");
    expect(result).toContain("## Remote Host Policy (1)");
  });

  it("returns null when .my-context is unavailable", () => {
    const projectRoot = join(tempRoot, "project");
    mkdirSync(projectRoot, { recursive: true });

    const builder = createInjectedMemoryContextBuilder();
    expect(builder.build({ projectRoot })).toBeNull();
  });

  it("caches static listing but re-reads MEMORY.md", () => {
    const projectRoot = join(tempRoot, "project");
    mkdirSync(projectRoot, { recursive: true });

    const contextRoot = join(tempRoot, "contexts", "project");
    mkdirSync(join(contextRoot, "architecture"), { recursive: true });
    writeFileSync(join(contextRoot, "MEMORY.md"), "first value");
    symlinkSync(contextRoot, join(projectRoot, ".my-context"));

    const builder = createInjectedMemoryContextBuilder();
    const first = builder.build({ projectRoot });
    writeFileSync(join(contextRoot, "MEMORY.md"), "second value");
    const second = builder.build({ projectRoot });

    expect(first).toContain("first value");
    expect(second).toContain("second value");
    expect(second).toContain(".my-context/architecture/");
  });
});
