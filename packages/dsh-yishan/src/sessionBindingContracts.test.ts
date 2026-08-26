import { describe, expect, it } from "vitest";

import {
  isYishanSessionBoundEvent,
  isYishanSessionSummaryEvent,
  isYishanSessionTitleEvent,
  parseSessionBoundData,
  parseSessionSummaryData,
  parseSessionTitleData,
} from "./sessionBindingContracts";

const binding = {
  version: 1,
  workspaceId: "workspace-1",
  projectId: "",
  organizationId: "",
  ownerNodeId: "node-1",
  cwd: "/workspace",
};

describe("Yishan session binding event contracts", () => {
  it("classifies only a strictly valid bound event", () => {
    expect(isYishanSessionBoundEvent({ type: "yishan/session-bound.v1", seq: 0, time: 1, data: binding })).toBe(true);
    expect(
      isYishanSessionBoundEvent({ type: "yishan/session-bound.v1", seq: 0, time: 1, data: { ...binding, x: 1 } }),
    ).toBe(false);
    expect(isYishanSessionBoundEvent({ type: "turn/end", seq: 0, time: 1, data: binding })).toBe(false);
    expect(
      isYishanSessionSummaryEvent({
        type: "yishan/session-summary.v1",
        data: {
          version: 1,
          sourceSeq: 0,
          provider: "provider",
          model: "model",
          title: "title",
          summary: "summary",
          generationUsage: { inputTokens: 0, outputTokens: 0 },
        },
      }),
    ).toBe(true);
    expect(
      isYishanSessionTitleEvent({
        type: "yishan/session-title.v1",
        data: { version: 1, sourceSeq: 0, idempotencyKey: "key", origin: "auto", title: "title" },
      }),
    ).toBe(true);
  });

  it("strictly validates all event payloads", () => {
    expect(parseSessionBoundData(binding)).toEqual(binding);
    expect(() => parseSessionBoundData({ ...binding, workspaceId: "" })).toThrow("workspaceId is required");
    expect(() => parseSessionBoundData({ ...binding, version: 2 })).toThrow("version must equal 1");

    expect(
      parseSessionSummaryData({
        version: 1,
        sourceSeq: 0,
        provider: "provider",
        model: "model",
        title: "title",
        summary: "summary",
        generationUsage: { inputTokens: 0, outputTokens: 1, cacheReadTokens: 2 },
      }),
    ).toMatchObject({ provider: "provider" });
    expect(() =>
      parseSessionSummaryData({
        version: 1,
        sourceSeq: 0,
        provider: "provider",
        model: "model",
        title: "title",
        summary: "summary",
        generationUsage: { inputTokens: 0, outputTokens: 1, extra: 2 },
      }),
    ).toThrow("generationUsage has unsupported fields");

    expect(
      parseSessionTitleData({ version: 1, sourceSeq: 0, idempotencyKey: "key", origin: "manual", title: "title" }),
    ).toEqual({
      version: 1,
      sourceSeq: 0,
      idempotencyKey: "key",
      origin: "manual",
      title: "title",
    });
    expect(() =>
      parseSessionTitleData({ version: 1, sourceSeq: 0, idempotencyKey: "key", origin: "other", title: "title" }),
    ).toThrow('origin must be "manual" or "auto"');
  });
});
