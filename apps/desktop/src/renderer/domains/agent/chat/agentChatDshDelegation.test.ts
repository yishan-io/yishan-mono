import { describe, expect, it } from "vitest";
import {
  recoverDshDelegationLifecycle,
  resolveDshDelegationDiagnostics,
  resolveDshDelegationStates,
} from "./agentChatDshDelegation";
import type { AgentMessage } from "./agentChatTypes";

const call: AgentMessage = {
  id: "assistant",
  role: "assistant",
  content: [{ type: "toolCall", id: "call-1", name: "delegate_builder", arguments: { task: "Build the card" } }],
};
const acceptedResult: AgentMessage = {
  id: "result",
  role: "toolResult",
  toolCallId: "call-1",
  content: "Started builder child child-1",
  details: { dshDelegation: { childSessionId: "child-1" } },
};

describe("DSH fixed delegation state", () => {
  it("projects launch, terminal completion, cancellation, and error using stable structured identities", () => {
    expect(resolveDshDelegationStates([call], new Map()).get("call-1")).toBe("queued");
    expect(resolveDshDelegationStates([call, acceptedResult], new Map()).get("call-1")).toBe("running");
    expect(
      resolveDshDelegationStates(
        [call, acceptedResult],
        new Map([["child-1", { childSessionId: "child-1", state: "completed" }]]),
      ).get("call-1"),
    ).toBe("completed");
    expect(
      resolveDshDelegationStates(
        [call, acceptedResult],
        new Map([["child-1", { childSessionId: "child-1", state: "aborted" }]]),
      ).get("call-1"),
    ).toBe("aborted");
    expect(
      resolveDshDelegationStates(
        [call, acceptedResult],
        new Map([["child-1", { childSessionId: "child-1", state: "error" }]]),
      ).get("call-1"),
    ).toBe("error");
  });

  it("recovers terminal delegation state from bounded durable settlement records", () => {
    expect(
      recoverDshDelegationLifecycle([
        { type: "yishan/subagent-settled.v1", data: { version: 1, childSessionId: "complete", state: "completed" } },
        { type: "yishan/subagent-settled.v1", data: { version: 1, childSessionId: "cancel", state: "aborted" } },
        { type: "yishan/subagent-settled.v1", data: { version: 1, childSessionId: "failed", state: "error" } },
        { type: "yishan/subagent-settled.v1", data: { version: 2, childSessionId: "ignored", state: "completed" } },
      ]),
    ).toEqual({
      complete: { childSessionId: "complete", state: "completed" },
      cancel: { childSessionId: "cancel", state: "aborted" },
      failed: { childSessionId: "failed", state: "error" },
    });
  });

  it("recovers and projects a structured terminal diagnostic without inspecting model text", () => {
    const lifecycle = new Map([
      [
        "child-1",
        {
          childSessionId: "child-1",
          state: "error" as const,
          diagnostic: { reason: "max-tokens" as const },
        },
      ],
    ]);
    expect(
      recoverDshDelegationLifecycle([
        {
          type: "yishan/subagent-settled.v1",
          data: { version: 1, childSessionId: "child-1", state: "error", diagnostic: { reason: "max-tokens" } },
        },
      ]),
    ).toEqual(Object.fromEntries(lifecycle));
    expect(resolveDshDelegationDiagnostics([call, acceptedResult], lifecycle)).toEqual(
      new Map([["call-1", { reason: "max-tokens" }]]),
    );
  });

  it("does not infer a child identity from result text when metadata is malformed or absent", () => {
    expect(resolveDshDelegationStates([{ ...call }, { ...acceptedResult, details: {} }], new Map()).get("call-1")).toBe(
      "error",
    );
  });
});
