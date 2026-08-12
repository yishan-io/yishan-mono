import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { app } from "electron";
import { getErrorMessage } from "../../shared/helpers/errorHelpers";
import { resolveCliProfileName } from "../daemon/daemonHealthCheck";
import type { BrowserHistoryEntry, BrowserHistoryGroup } from "../ipc";
import { isDevMode } from "../runtime/environment";

const MAX_ENTRIES = 500;
const PRUNE_THRESHOLD = 1000;
const PRUNE_CHECK_APPEND_INTERVAL = 100;
const PRUNE_CHECK_MIN_INTERVAL_MS = 2 * 60 * 1000;
/** Per-account data layer under a profile, mirroring the CLI: profiles/<env>/accounts/<userId>/. */
const ACCOUNT_DIR_NAME = "accounts";
/** Active-account pointer recorded by the CLI in credential.yaml. */
const USER_ID_KEY = "user_id";
let appendCountSincePruneCheck = 0;
let lastPruneCheckAtMs = 0;

function historyFileName(): string {
  return isDevMode() ? "browser-history.dev.jsonl" : "browser-history.jsonl";
}

function resolveCliProfileDir(): string {
  return join(homedir(), ".yishan", "profiles", resolveCliProfileName());
}

/**
 * Reads the active user_id recorded by the CLI in credential.yaml, or ""
 * when it is absent or the file is unreadable (first login, env-var creds).
 */
async function readUserIdFromCredential(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(join(resolveCliProfileDir(), "credential.yaml"), "utf8");
  } catch {
    return "";
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${USER_ID_KEY}:`)) {
      continue;
    }
    const value = trimmed.slice(USER_ID_KEY.length + 1).trim();
    if (!value) {
      return "";
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).trim();
    }
    return value;
  }
  return "";
}

/**
 * Resolves the account-scoped data dir: profiles/<env>/accounts/<userId>/ when
 * credential.yaml records a user_id, else the profile (env root) directory.
 * Resolved lazily on every access so an account switch takes effect without a
 * restart — the file read is cheap and the path can never go stale.
 */
async function resolveAccountDataDir(): Promise<string> {
  const profileDir = resolveCliProfileDir();
  const userId = await readUserIdFromCredential();
  if (!userId) {
    return profileDir;
  }
  return join(profileDir, ACCOUNT_DIR_NAME, userId);
}

/**
 * One-time migration of pre-account browser history into the resolved target.
 * Legacy sources, in order: the Electron userData file (the pre-account
 * layout), then the profile-root file written while no account was known
 * (logged-out browsing). Each source is moved only when the target does not
 * exist yet, so the migration is idempotent per account and never overwrites
 * newer history with older data.
 */
async function migrateLegacyHistoryFiles(target: string): Promise<void> {
  if (existsSync(target)) {
    return;
  }
  const legacySources = [
    join(app.getPath("userData"), historyFileName()),
    join(resolveCliProfileDir(), historyFileName()),
  ];
  for (const legacy of legacySources) {
    if (legacy === target || !existsSync(legacy)) {
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    try {
      await copyFile(legacy, target);
      await unlink(legacy);
      return;
    } catch (error) {
      console.warn("Failed to migrate legacy browser history:", getErrorMessage(error));
    }
  }
}

async function resolveHistoryFilePath(): Promise<string> {
  const filePath = join(await resolveAccountDataDir(), historyFileName());
  await migrateLegacyHistoryFiles(filePath);
  return filePath;
}

function extractHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function parseEntries(raw: string): BrowserHistoryEntry[] {
  const entries: BrowserHistoryEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      entries.push(JSON.parse(trimmed) as BrowserHistoryEntry);
    } catch {}
  }
  return entries;
}

function deduplicateEntries(entries: BrowserHistoryEntry[]): BrowserHistoryEntry[] {
  const seen = new Map<string, BrowserHistoryEntry>();
  for (const entry of entries) {
    const existing = seen.get(entry.url);
    if (existing) {
      existing.title = entry.title || existing.title;
      existing.faviconUrl = entry.faviconUrl || existing.faviconUrl;
      existing.visitedAt = entry.visitedAt;
    } else {
      seen.set(entry.url, { ...entry });
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
}

async function pruneIfNeeded(entries: BrowserHistoryEntry[], filePath: string): Promise<void> {
  if (entries.length < PRUNE_THRESHOLD) {
    return;
  }
  const pruned = entries.slice(0, MAX_ENTRIES);
  const lines = `${pruned.map((e) => JSON.stringify(e)).join("\n")}\n`;
  await writeFile(filePath, lines, "utf8");
}

async function runPruneCheck(filePath: string): Promise<void> {
  lastPruneCheckAtMs = Date.now();
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return;
  }
  const entries = parseEntries(raw);
  await pruneIfNeeded(entries, filePath);
}

export async function appendBrowserHistoryEntry(entry: BrowserHistoryEntry): Promise<void> {
  const filePath = await resolveHistoryFilePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  appendCountSincePruneCheck += 1;
  const shouldCheckByCount = appendCountSincePruneCheck >= PRUNE_CHECK_APPEND_INTERVAL;
  const now = Date.now();
  const shouldCheckByTime = now - lastPruneCheckAtMs >= PRUNE_CHECK_MIN_INTERVAL_MS;
  if (!shouldCheckByCount && !shouldCheckByTime) {
    return;
  }

  appendCountSincePruneCheck = 0;
  await runPruneCheck(filePath);
}

export async function flushBrowserHistoryPruneCheck(): Promise<void> {
  appendCountSincePruneCheck = 0;
  await runPruneCheck(await resolveHistoryFilePath());
}

export async function loadBrowserHistoryGroups(): Promise<BrowserHistoryGroup[]> {
  const filePath = await resolveHistoryFilePath();
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  const deduped = deduplicateEntries(parseEntries(raw));

  const groupMap = new Map<string, BrowserHistoryGroup>();
  for (const entry of deduped) {
    const host = extractHost(entry.url);
    let group = groupMap.get(host);
    if (!group) {
      group = { host, faviconUrl: entry.faviconUrl, entries: [] };
      groupMap.set(host, group);
    }
    if (entry.faviconUrl) {
      group.faviconUrl = entry.faviconUrl;
    }
    group.entries.push(entry);
  }

  return Array.from(groupMap.values());
}
