import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserHistoryEntry } from "../bridge/browser";
import { appendBrowserHistoryEntry, flushBrowserHistoryPruneCheck, loadBrowserHistoryGroups } from "./browserHistory";

vi.mock("electron", () => ({
  app: { getPath: vi.fn() },
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

vi.mock("../runtime/environment", () => ({
  isDevMode: () => false,
}));

const HISTORY_FILE = "browser-history.jsonl";

let homeDir: string;
let userDataDir: string;
let profileDir: string;

function writeCredential(userId?: string): void {
  mkdirSync(profileDir, { recursive: true });
  const lines = ["api_base_url: https://api.example.com", "api_token: tok"];
  if (userId) {
    lines.push(`user_id: ${userId}`);
  }
  writeFileSync(join(profileDir, "credential.yaml"), `${lines.join("\n")}\n`);
}

function entry(url: string, visitedAt = "2026-01-01T00:00:00Z"): BrowserHistoryEntry {
  return { url, title: `title-${url}`, visitedAt };
}

function accountDir(userId: string): string {
  return join(profileDir, "accounts", userId);
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
}

describe("browserHistory account scoping", () => {
  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "browser-history-home-"));
    userDataDir = mkdtempSync(join(tmpdir(), "browser-history-userdata-"));
    vi.mocked(homedir).mockReturnValue(homeDir);
    vi.mocked(app.getPath).mockImplementation((name: string) => (name === "userData" ? userDataDir : ""));
    process.env.YISHAN_PROFILE = "account-test";
    profileDir = join(homeDir, ".yishan", "profiles", "account-test");
  });

  afterEach(() => {
    process.env.YISHAN_PROFILE = undefined;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it("appends to the account data dir when user_id is known", async () => {
    writeCredential("user_123");

    await appendBrowserHistoryEntry(entry("https://a.example.com/page"));

    const target = join(accountDir("user_123"), HISTORY_FILE);
    expect(existsSync(target)).toBe(true);
    expect(readLines(target)).toContain(JSON.stringify(entry("https://a.example.com/page")));
    expect(existsSync(join(profileDir, HISTORY_FILE))).toBe(false);

    const groups = await loadBrowserHistoryGroups();
    expect(groups.some((group) => group.host === "a.example.com")).toBe(true);
  });

  it("falls back to the profile dir when user_id is unknown", async () => {
    writeCredential();

    await appendBrowserHistoryEntry(entry("https://b.example.com/"));

    const target = join(profileDir, HISTORY_FILE);
    expect(existsSync(target)).toBe(true);
    expect(readLines(target)).toContain(JSON.stringify(entry("https://b.example.com/")));
    expect(existsSync(join(accountDir("user_123"), HISTORY_FILE))).toBe(false);
  });

  it("handles a quoted user_id in credential.yaml", async () => {
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, "credential.yaml"), 'user_id: "user_quoted"\n');

    await appendBrowserHistoryEntry(entry("https://c.example.com/"));

    expect(existsSync(join(accountDir("user_quoted"), HISTORY_FILE))).toBe(true);
  });

  it("migrates the legacy userData history once into the account dir", async () => {
    const legacyPath = join(userDataDir, HISTORY_FILE);
    mkdirSync(userDataDir, { recursive: true });
    writeFileSync(legacyPath, `${JSON.stringify(entry("https://legacy.example.com/"))}\n`);
    writeCredential("user_123");

    await appendBrowserHistoryEntry(entry("https://new.example.com/"));

    const target = join(accountDir("user_123"), HISTORY_FILE);
    const lines = readLines(target);
    expect(lines).toContain(JSON.stringify(entry("https://legacy.example.com/")));
    expect(lines).toContain(JSON.stringify(entry("https://new.example.com/")));
    expect(existsSync(legacyPath)).toBe(false);

    // Idempotent: a later append must not re-import the legacy entry.
    await appendBrowserHistoryEntry(entry("https://new2.example.com/"));
    const after = readLines(target);
    expect(after.filter((line) => line.includes("legacy.example.com")).length).toBe(1);
  });

  it("migrates profile-root history into the account dir once the account is known", async () => {
    writeCredential();
    await appendBrowserHistoryEntry(entry("https://loggedout.example.com/"));

    writeCredential("user_123");
    await appendBrowserHistoryEntry(entry("https://loggedin.example.com/"));

    const target = join(accountDir("user_123"), HISTORY_FILE);
    const lines = readLines(target);
    expect(lines).toContain(JSON.stringify(entry("https://loggedout.example.com/")));
    expect(lines).toContain(JSON.stringify(entry("https://loggedin.example.com/")));
    expect(existsSync(join(profileDir, HISTORY_FILE))).toBe(false);
  });

  it("does not leak history across accounts", async () => {
    writeCredential("user_A");
    await appendBrowserHistoryEntry(entry("https://a-account.example.com/"));

    writeCredential("user_B");
    await appendBrowserHistoryEntry(entry("https://b-account.example.com/"));

    const groups = await loadBrowserHistoryGroups();
    expect(groups.some((group) => group.host === "a-account.example.com")).toBe(false);
    expect(groups.some((group) => group.host === "b-account.example.com")).toBe(true);

    const accountAFile = join(accountDir("user_A"), HISTORY_FILE);
    expect(readLines(accountAFile)).toContain(JSON.stringify(entry("https://a-account.example.com/")));
    expect(readLines(accountAFile)).not.toContain(JSON.stringify(entry("https://b-account.example.com/")));
  });

  it("flush resolves the account-scoped path without error", async () => {
    writeCredential("user_123");
    await appendBrowserHistoryEntry(entry("https://flush.example.com/"));

    await expect(flushBrowserHistoryPruneCheck()).resolves.toBeUndefined();
    expect(existsSync(join(accountDir("user_123"), HISTORY_FILE))).toBe(true);
  });
});
