import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createYishanRuntime } from "./runtime";

/** Verifies that the fixed production graph has no test replay LLM adapter. */
describe("Yishan production runtime without an LLM adapter", () => {
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
