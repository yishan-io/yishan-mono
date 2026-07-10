import { describe, expect, it, vi } from "vitest";

const { registerWorkspaceToolsMock } = vi.hoisted(() => ({
  registerWorkspaceToolsMock: vi.fn(),
}));

vi.mock("./tools/registerWorkspaceTools", () => ({
  registerWorkspaceTools: registerWorkspaceToolsMock,
}));

vi.mock("./backend/cliWorkspaceClient", () => ({
  createCliWorkspaceClient: vi.fn(() => ({
    list: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    close: vi.fn(),
  })),
}));

import { createPiWorkspaceExtension } from "./extension";

describe("createPiWorkspaceExtension", () => {
  it("registers workspace tools", () => {
    const pi = {
      registerTool: vi.fn(),
    };

    createPiWorkspaceExtension(pi as never);

    expect(registerWorkspaceToolsMock).toHaveBeenCalledTimes(1);
  });
});
