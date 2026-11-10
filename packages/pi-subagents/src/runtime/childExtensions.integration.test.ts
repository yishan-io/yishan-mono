import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";

import { resetChildExtensionCache, resolveChildExtensionFactories } from "./childExtensions";

afterEach(() => {
  resetChildExtensionCache();
  vi.unstubAllEnvs();
});

test("forwards only task_read from the installed Task package without a daemon endpoint", async () => {
  vi.stubEnv("YISHAN_DAEMON_WS_URL", "");
  const registerTool = vi.fn<ExtensionAPI["registerTool"]>();
  const pi = { registerTool, registerCommand: vi.fn(), on: vi.fn() };

  // No module mocks: exercise package exports and runtime dependency resolution.
  for (const factory of await resolveChildExtensionFactories()) await factory(pi as never);

  const taskTools = registerTool.mock.calls.map(([tool]) => tool.name).filter((name) => name.startsWith("task_"));
  expect(taskTools).toEqual(["task_read"]);
});
