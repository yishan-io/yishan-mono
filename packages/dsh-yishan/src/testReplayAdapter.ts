import type { Context } from "@deepseek-ai/cordis";
import { type GenerateOptions, LlmAdapter, type StreamChunk } from "@deepseek-ai/dsh-llm";

/** Environment variable that enables the deterministic replay adapter for direct test launches only. */
export const YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE = "YISHAN_DSH_TEST_REPLAY";
/** Exact test-only value required to enable the deterministic replay adapter. */
export const YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VALUE = "1";
/** Provider name served by the deterministic replay adapter. */
export const YISHAN_DSH_TEST_REPLAY_PROVIDER = "smoke-replay";
/** Text emitted by the deterministic replay adapter before cancellation. */
export const YISHAN_DSH_TEST_REPLAY_TEXT = "deterministic replay response";

/** Returns whether an environment explicitly enables the direct-launch test replay adapter. */
export function isYishanDshTestReplayEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE] === YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VALUE;
}

/** Registers the deterministic replay adapter used only by local packaged-runtime tests. */
export function installYishanDshTestReplayAdapter(context: Context): void {
  context.llm.registerAdapter([YISHAN_DSH_TEST_REPLAY_PROVIDER], new ReplayLlmAdapter());
}

class ReplayLlmAdapter extends LlmAdapter {
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: YISHAN_DSH_TEST_REPLAY_TEXT };
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
