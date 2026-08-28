/**
 * Yishan DSH credentials service plugin.
 *
 * Provides the `credentials` service that DSH LLM adapters query to resolve
 * API keys by their env-var reference name (e.g. "DEEPSEEK_API_KEY").
 *
 * Reads from `<dataDirectory>/.credentials.yaml`:
 *   version: 1
 *   refs:
 *     DEEPSEEK_API_KEY: sk-...
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";

export const CREDENTIALS_FILE_NAME = ".credentials.yaml";
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type CredentialEntry = { value: string };
export type CredentialsService = { resolve(ref: string): Promise<CredentialEntry | undefined> };

/** Parses the YAML credentials file without a heavy YAML parser dependency. */
function parseCredentialsYaml(text: string): Map<string, string> {
  const refs = new Map<string, string>();
  let inRefs = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (line === "refs:") { inRefs = true; continue; }
    if (!line.startsWith(" ") && !line.startsWith("\t")) { inRefs = false; continue; }
    if (!inRefs) continue;
    const match = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!name) continue;
    const value = (rawValue ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) refs.set(name, value);
  }
  return refs;
}

/** Creates a Yishan DSH credentials service that reads from the given directory. */
export function createCredentialsService(dataDirectory: string): CredentialsService {
  const filePath = join(dataDirectory, CREDENTIALS_FILE_NAME);
  return {
    async resolve(ref: string): Promise<CredentialEntry | undefined> {
      if (!REF_PATTERN.test(ref)) return undefined;
      let text: string;
      try {
        text = await readFile(filePath, "utf8");
      } catch {
        return undefined;
      }
      const refs = parseCredentialsYaml(text);
      const value = refs.get(ref);
      return value !== undefined ? { value } : undefined;
    },
  };
}

/** Registers the credentials service plugin for the Yishan DSH runtime. */
export function installCredentialsPlugin(ctx: Context, dataDirectory: string): void {
  ctx.provide("credentials", createCredentialsService(dataDirectory));
}
