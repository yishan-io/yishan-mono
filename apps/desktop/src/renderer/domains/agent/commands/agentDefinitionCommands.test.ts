import { describe, expect, it, vi } from "vitest";
import { listAvailableAgentTools } from "./agentDefinitionCommands";

const mocks = vi.hoisted(() => ({
  listAvailableAgentTools: vi.fn(),
}));

vi.mock("../daemon/daemonAgentProcedures", () => ({
  listAvailableAgentTools: mocks.listAvailableAgentTools,
}));

describe("listAvailableAgentTools", () => {
  it("trims and deduplicates valid tool names in daemon order", async () => {
    mocks.listAvailableAgentTools.mockResolvedValue({ tools: [" read ", "bash", "read", " edit "] });

    await expect(listAvailableAgentTools()).resolves.toEqual(["read", "bash", "edit"]);
  });

  it("returns an empty list for malformed daemon payloads", async () => {
    mocks.listAvailableAgentTools.mockResolvedValue({ tools: "read" });

    await expect(listAvailableAgentTools()).resolves.toEqual([]);
  });

  it("returns an empty list for an empty catalog", async () => {
    mocks.listAvailableAgentTools.mockResolvedValue({ tools: [] });

    await expect(listAvailableAgentTools()).resolves.toEqual([]);
  });

  it("ignores blank and non-string catalog entries", async () => {
    mocks.listAvailableAgentTools.mockResolvedValue({ tools: ["", "  ", "read", 123, null, "read"] });

    await expect(listAvailableAgentTools()).resolves.toEqual(["read"]);
  });
});
