import { Session, SessionId } from "@deepseek-ai/dsh-session";
import { describe, expect, it } from "vitest";

import {
  appendSessionBinding,
  hasMatchingSessionBinding,
  hasSameSessionBinding,
  isSessionBoundEvent,
  parseSessionBoundData,
} from "./binding";

const binding = {
  version: 1,
  workspaceId: "workspace-1",
  projectId: "",
  organizationId: "",
  ownerNodeId: "node-1",
  cwd: "/workspace",
  policy: { authorization: "daemon-authorized" },
} as const;

describe("Yishan session binding event contracts", () => {
  it("classifies only a strictly valid bound event", () => {
    expect(isSessionBoundEvent({ type: "yishan/session-bound.v1", seq: 0, time: 1, data: binding })).toBe(true);
    expect(isSessionBoundEvent({ type: "yishan/session-bound.v1", seq: 0, time: 1, data: { ...binding, x: 1 } })).toBe(
      false,
    );
    expect(isSessionBoundEvent({ type: "turn/end", seq: 0, time: 1, data: binding })).toBe(false);
  });

  it("preserves exact binding comparison and append semantics", async () => {
    const session = Session.create(SessionId("session-bound"));

    await expect(appendSessionBinding(session, binding, async () => true)).resolves.toBe("persisted");
    expect(hasMatchingSessionBinding(session, binding)).toBe(true);

    const mismatchedSequence = Session.create(SessionId("session-mismatched-sequence"));
    mismatchedSequence.append("turn/start", { turn: 1 });
    mismatchedSequence.append("yishan/session-bound.v1", binding);
    expect(hasMatchingSessionBinding(mismatchedSequence, binding)).toBe(false);
    expect(hasSameSessionBinding(binding, { ...binding, ownerNodeId: "other-node" })).toBe(false);

    const nonEmptySession = Session.create(SessionId("session-non-empty"));
    nonEmptySession.append("turn/start", { turn: 1 });
    await expect(appendSessionBinding(nonEmptySession, binding, async () => true)).resolves.toBe("conflict");
  });

  it("normalizes a legacy binding before comparison", () => {
    const { policy: _policy, ...legacyBinding } = binding;
    expect(hasSameSessionBinding(legacyBinding, binding)).toBe(true);
  });

  it("strictly validates the binding payload", () => {
    expect(parseSessionBoundData(binding)).toEqual(binding);
    expect(() => parseSessionBoundData({ ...binding, workspaceId: "" })).toThrow();
    expect(() => parseSessionBoundData({ ...binding, version: 2 })).toThrow();
    expect(() => parseSessionBoundData({ ...binding, policy: { authorization: "untrusted" } })).toThrow();
    const { policy: _policy, ...legacyBinding } = binding;
    expect(parseSessionBoundData(legacyBinding)).toEqual(binding);
  });
});
