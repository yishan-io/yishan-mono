import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { listYishanProviders, validateYishanProviderSelection } from "./llmProviders";
import { createYishanRuntime } from "./runtime";
import {
  YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VALUE,
  YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE,
  YISHAN_DSH_TEST_REPLAY_MODEL,
  YISHAN_DSH_TEST_REPLAY_PROVIDER,
  installYishanDshTestReplayAdapter,
  isYishanDshTestReplayEnabled,
} from "./testReplayAdapter";

afterEach(() => vi.unstubAllEnvs());

/** Verifies that the fixed production graph has no test replay LLM adapter. */
describe("Yishan production runtime without an LLM adapter", () => {
  it("accepts only the exact test-only replay environment value", () => {
    expect(isYishanDshTestReplayEnabled({})).toBe(false);
    expect(isYishanDshTestReplayEnabled({ [YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE]: "true" })).toBe(false);
    expect(isYishanDshTestReplayEnabled({ [YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE]: "1 " })).toBe(false);
    expect(
      isYishanDshTestReplayEnabled({
        [YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE]: YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VALUE,
      }),
    ).toBe(true);
  });

  it("includes the replay route in catalog validation only with the exact test flag", async () => {
    vi.stubEnv(YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE, YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VALUE);
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-test-replay-"));
    const runtime = await createYishanRuntime({
      dataDirectory,
      input: new PassThrough(),
      output: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
      exit: () => undefined,
    });

    try {
      installYishanDshTestReplayAdapter(runtime.context);
      const catalog = await listYishanProviders(runtime.context.llm);
      expect(catalog.providers).toContainEqual({
        id: YISHAN_DSH_TEST_REPLAY_PROVIDER,
        authentication: "ambient",
        setupRequired: false,
        models: [
          {
            provider: YISHAN_DSH_TEST_REPLAY_PROVIDER,
            id: YISHAN_DSH_TEST_REPLAY_MODEL,
            name: YISHAN_DSH_TEST_REPLAY_MODEL,
          },
        ],
      });
      vi.stubEnv(YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE, "true");
      await expect(
        validateYishanProviderSelection(runtime.context.llm, {
          provider: YISHAN_DSH_TEST_REPLAY_PROVIDER,
          model: YISHAN_DSH_TEST_REPLAY_MODEL,
        }),
      ).rejects.toMatchObject({ code: "YISHAN_PROVIDER_SELECTION_INVALID" });
      vi.stubEnv(YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE, YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VALUE);
      await expect(
        validateYishanProviderSelection(runtime.context.llm, {
          provider: YISHAN_DSH_TEST_REPLAY_PROVIDER,
          model: YISHAN_DSH_TEST_REPLAY_MODEL,
        }),
      ).resolves.toBeUndefined();
    } finally {
      await runtime.shutdown();
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });

  it("finishes an unregistered replay prompt with the no-adapter failure", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-no-adapter-"));
    const runtime = await createYishanRuntime({
      dataDirectory,
      input: new PassThrough(),
      output: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
      exit: () => undefined,
    });

    try {
      const chunks = [];
      for await (const chunk of runtime.context.llm.stream({
        provider: "smoke-replay",
        model: "smoke-model",
        messages: [],
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toMatchObject([
        {
          type: "finish",
          reason: { kind: "error", failure: { code: "NO_ADAPTER" } },
        },
      ]);
    } finally {
      await runtime.shutdown();
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });
});
