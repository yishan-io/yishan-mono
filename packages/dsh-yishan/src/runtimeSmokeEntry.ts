import { type GenerateOptions, LlmAdapter, type StreamChunk } from "@deepseek-ai/dsh-llm";

import { createYishanRuntime, installRuntimeShutdownHandlers } from "./runtime";

const REPLAY_PROVIDER = "smoke-replay";
const REPLAY_TEXT = "deterministic replay response";

class ReplayLlmAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: REPLAY_TEXT };
    await waitForAbort(options.signal);
    yield {
      type: "finish",
      reason: {
        kind: "aborted",
        failure: { code: "SMOKE_ABORTED", message: "the smoke test cancelled the replay stream" },
      },
    };
  }
}

/** Waits for the test-controlled prompt cancellation without using a timer. */
function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolveAbort) => signal?.addEventListener("abort", () => resolveAbort(), { once: true }));
}

const runtime = await createYishanRuntime();
runtime.context.llm.registerAdapter([REPLAY_PROVIDER], new ReplayLlmAdapter());
installRuntimeShutdownHandlers(runtime);
