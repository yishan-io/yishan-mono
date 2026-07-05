import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CONFIG_DIR_NAME, type SessionEntry, type SessionHeader } from "@earendil-works/pi-coding-agent";

/** Input required to persist one agent transcript as JSONL. */
export interface WriteAgentTranscriptOptions {
  cwd: string;
  agentId: string;
  header: SessionHeader | null;
  entries: SessionEntry[];
}

/**
 * Writes one agent transcript under `.pi/output/agents/<agent-id>.jsonl`.
 */
export async function writeAgentTranscript(options: WriteAgentTranscriptOptions): Promise<string> {
  const transcriptDir = join(options.cwd, CONFIG_DIR_NAME, "output", "agents");
  await mkdir(transcriptDir, { recursive: true });

  const transcriptPath = join(transcriptDir, `${options.agentId}.jsonl`);
  const lines: string[] = [];
  if (options.header) {
    lines.push(JSON.stringify(options.header));
  }

  for (const entry of options.entries) {
    lines.push(JSON.stringify(entry));
  }

  await writeFile(transcriptPath, `${lines.join("\n")}\n`, "utf8");
  return transcriptPath;
}
