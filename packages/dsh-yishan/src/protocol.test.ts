import { describe, expect, it } from "vitest";

import {
  YISHAN_METHODS,
  YISHAN_NOTIFICATIONS,
  YISHAN_PROTOCOL_VERSION,
  YISHAN_REVERSE_METHODS,
  yishanMethod,
} from "./protocol";

describe("yishanMethod", () => {
  it("versions extension method names", () => {
    expect(yishanMethod("session.cancel")).toBe("yishan.v1.session.cancel");
    expect(YISHAN_PROTOCOL_VERSION).toBe(1);
  });

  it("rejects an empty capability name", () => {
    expect(() => yishanMethod("")).toThrow("capability name is required");
  });

  it("declares the session lifecycle methods missing from stock DSH SDK RPC", () => {
    expect(YISHAN_METHODS).toMatchObject({
      cancel: "yishan.v1.session.cancel",
      dispose: "yishan.v1.session.dispose",
      read: "yishan.v1.session.read",
      resume: "yishan.v1.session.resume",
      start: "yishan.v1.session.start",
      prompt: "yishan.v1.session.prompt",
      subscribe: "yishan.v1.session.subscribe",
      subagentInterrupt: "yishan.v1.subagent.interrupt",
    });
  });

  it("exposes no Yishan provider catalog or settings RPC", () => {
    expect(YISHAN_METHODS).not.toHaveProperty("catalog");
    expect(YISHAN_METHODS).not.toHaveProperty("providers");
    expect(YISHAN_METHODS).not.toHaveProperty("settings");
  });

  it("declares reverse requests and durable notifications", () => {
    expect(YISHAN_REVERSE_METHODS.capabilityRequest).toBe("yishan.v1.capability.request");
    expect(YISHAN_REVERSE_METHODS.interactionRequest).toBe("yishan.v1.interaction.request");
    expect(YISHAN_NOTIFICATIONS.durableCursor).toBe("yishan.v1.session.durable-cursor");
    expect(YISHAN_NOTIFICATIONS.transcriptReset).toBe("yishan.v1.session.transcript-reset");
  });
});
