import { describe, expect, it, vi } from "vitest";

const { registerTaskToolsMock } = vi.hoisted(() => ({ registerTaskToolsMock: vi.fn() }));

vi.mock("./tools/registerTaskTools", () => ({ registerTaskTools: registerTaskToolsMock }));

import { createPiTaskExtension } from "./extension";

describe("createPiTaskExtension", () => {
  it("registers task tools when the extension loads", () => {
    const pi = { registerTool: vi.fn() };

    createPiTaskExtension(pi as never);

    expect(registerTaskToolsMock).toHaveBeenCalledWith(pi);
  });
});
