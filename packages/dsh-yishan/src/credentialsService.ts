/**
 * Yishan DSH credentials service plugin.
 *
 * Provides the `credentials` service that DSH LLM adapters query to resolve
 * API keys by their env-var reference name (e.g. "DEEPSEEK_API_KEY").
 *
 * This account-scoped file is DSH credential storage, not DSH configuration
 * YAML or Pi `auth.json`. A mounted credentials service makes every named
 * API-key reference (including direct DeepSeek) resolve only from this file;
 * a missing reference must not fall back to the launcher process environment.
 * Only pi-ai routes that name no reference may use provider-native system or
 * cloud ambient credential discovery.
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
/** The credential methods dsh-llm-pi-ai calls for ambient provider resolution.
 *
 * OAuth records are intentionally not supported here. The existing account-scoped
 * reference store has no safe durable record format or locking for refresh tokens.
 */
export type CredentialsService = {
  resolve(ref: string): Promise<CredentialEntry | undefined>;
  readRecord(key: string): Promise<undefined>;
};

/** Parses the YAML credentials file without a heavy YAML parser dependency. */
function parseCredentialsYaml(text: string): Map<string, string> {
  const refs = new Map<string, string>();
  let inRefs = false;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (line === "refs:") {
      inRefs = true;
      continue;
    }
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      inRefs = false;
      continue;
    }
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
    async readRecord(_key: string): Promise<undefined> {
      // Only reference-less, ambient-classified pi-ai routes reach this fallback.
      // This store owns API-key references only; it never reads Pi auth.json or
      // exposes durable OAuth grants.
      return undefined;
    },
  };
}

/** Registers the credentials service plugin for the Yishan DSH runtime. */
export function installCredentialsPlugin(ctx: Context, dataDirectory: string): void {
  ctx.provide("credentials", createCredentialsService(dataDirectory));
}
