import { describe, expect, it } from "vitest";

import { inject, name } from "./plugin";

describe("RPC server plugin", () => {
  it("declares the server dependencies for Cordis activation", () => {
    expect(name).toBe("yishan-sdk-jsonrpc-server");
    expect(inject).toEqual(
      expect.arrayContaining(["agents", "llm", "sessionQuery", "sessions", "sessionPersistence", "subagents"]),
    );
  });
});
