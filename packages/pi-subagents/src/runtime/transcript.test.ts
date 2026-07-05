import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeAgentTranscript } from "./transcript";

const tempDirs: string[] = [];

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-subagents-transcript-"));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe("writeAgentTranscript", () => {
  it("writes the session header and entries as jsonl", async () => {
    const cwd = createTempDir();
    const transcriptPath = await writeAgentTranscript({
      cwd,
      agentId: "agent-123",
      header: { type: "session", id: "session-1", timestamp: "2026-07-02T00:00:00.000Z", cwd },
      entries: [
        {
          id: "entry-1",
          parentId: null,
          type: "session_info",
          timestamp: "2026-07-02T00:00:01.000Z",
          name: "Test session",
        },
      ],
    });

    expect(transcriptPath).toBe(join(cwd, ".pi", "output", "agents", "agent-123.jsonl"));
    expect(readFileSync(transcriptPath, "utf8")).toBe(
      `${JSON.stringify({ type: "session", id: "session-1", timestamp: "2026-07-02T00:00:00.000Z", cwd })}\n${JSON.stringify({ id: "entry-1", parentId: null, type: "session_info", timestamp: "2026-07-02T00:00:01.000Z", name: "Test session" })}\n`,
    );
  });
});
