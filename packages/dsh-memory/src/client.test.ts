import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";
import { describe, expect, it, vi } from "vitest";

import { type MemoryCapabilityRequest, MemoryClient } from "./client";

const identity: CapabilityIdentity = { sessionId: "session-1", workspaceId: "workspace-1", generation: 2 };

describe("MemoryClient", () => {
  it("rejects malformed daemon results at the domain boundary", async () => {
    const transport: CapabilityTransport<MemoryCapabilityRequest> = {
      requestCapability: vi.fn(async () => ({ inserted: "invalid", updated: 0, deleted: 0 })),
    };
    const client = new MemoryClient(transport, identity, new AbortController().signal);

    await expect(client.reconcile()).rejects.toThrow();
  });
});
