import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { BrowserHistoryEntry, BrowserHistoryGroup } from "../ipc";
import { isDevMode } from "../runtime/environment";

const MAX_ENTRIES = 500;
const PRUNE_THRESHOLD = 1000;
const PRUNE_CHECK_APPEND_INTERVAL = 100;
const PRUNE_CHECK_MIN_INTERVAL_MS = 2 * 60 * 1000;
let appendCountSincePruneCheck = 0;
let lastPruneCheckAtMs = 0;

function resolveHistoryFilePath(): string {
  return join(app.getPath("userData"), isDevMode() ? "browser-history.dev.jsonl" : "browser-history.jsonl");
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

async function pruneIfNeeded(entries: BrowserHistoryEntry[]): Promise<void> {
  if (entries.length < PRUNE_THRESHOLD) {
    return;
  }
  const pruned = entries.slice(0, MAX_ENTRIES);
  const filePath = resolveHistoryFilePath();
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
  await pruneIfNeeded(entries);
}

export async function appendBrowserHistoryEntry(entry: BrowserHistoryEntry): Promise<void> {
  const filePath = resolveHistoryFilePath();
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
  await runPruneCheck(resolveHistoryFilePath());
}

export async function loadBrowserHistoryGroups(): Promise<BrowserHistoryGroup[]> {
  const filePath = resolveHistoryFilePath();
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
