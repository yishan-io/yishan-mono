import { describe, expect, it, vi } from "vitest";

import { parseSubagentInterruptRequest } from "./subagentInterruptContracts";
import { createSubagentInterruptHandler } from "./subagentInterruptHandler";

const request = { cwd: "/workspace", parentSessionId: "parent", childSessionId: "child" };

function createDependencies() {
  return {
    execution: { getOwnedLiveSession: vi.fn().mockReturnValue({ header: { cwd: "/workspace" } }) },
    sessionQuery: {
      listSessions: vi.fn().mockResolvedValue([
        {
          header: {
            id: "child",
            createdAt: 1,
            cwd: "/workspace",
            origin: "subagent",
            parentSession: "parent",
          },
          live: true,
          persisted: true,
        },
      ]),
    },
    subagents: {
      listChildren: vi
        .fn()
        .mockResolvedValue([
          { kind: "child", id: "child", activity: "running", hasChildren: false, mode: "continuable", label: "work" },
        ]),
      interrupt: vi.fn(),
    },
  };
}

describe("subagent interrupt handler", () => {
  it("parses only the exact non-empty interrupt contract", () => {
    expect(parseSubagentInterruptRequest(request)).toEqual(request);
    expect(() => parseSubagentInterruptRequest({ cwd: "/workspace", parentSessionId: "parent" })).toThrow();
    expect(() => parseSubagentInterruptRequest({ ...request, extra: true })).toThrow();
  });
  it("authorizes an owned parent and direct same-workspace child before dispatch", async () => {
    const dependencies = createDependencies();
    await expect(createSubagentInterruptHandler(dependencies)(request)).resolves.toEqual({
      parentSessionId: "parent",
      childSessionId: "child",
      interruptRequested: true,
    });
    expect(dependencies.subagents.listChildren).toHaveBeenCalledWith("parent");
    expect(dependencies.subagents.interrupt).toHaveBeenCalledWith("child", { kind: "user", parentSessionId: "parent" });
  });

  it("dispatches an inactive one-shot child without a live child session", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      {
        header: {
          id: "child",
          createdAt: 1,
          cwd: "/workspace",
          origin: "subagent",
          parentSession: "parent",
        },
        live: false,
        persisted: true,
      },
    ]);
    dependencies.subagents.listChildren.mockResolvedValue([
      { kind: "child", id: "child", activity: "inactive", hasChildren: false, mode: "one-shot" },
    ]);
    await expect(createSubagentInterruptHandler(dependencies)(request)).resolves.toEqual({
      parentSessionId: "parent",
      childSessionId: "child",
      interruptRequested: true,
    });
    expect(dependencies.subagents.interrupt).toHaveBeenCalledOnce();
  });

  it("denies a parent that is not currently Yishan-owned and live", async () => {
    const dependencies = createDependencies();
    dependencies.execution.getOwnedLiveSession.mockReturnValue(undefined);
    await expect(createSubagentInterruptHandler(dependencies)(request)).rejects.toMatchObject({
      code: "YISHAN_PARENT_NOT_OWNED",
    });
    expect(dependencies.subagents.listChildren).not.toHaveBeenCalled();
  });

  it("denies a parent with a different authoritative cwd", async () => {
    const dependencies = createDependencies();
    dependencies.execution.getOwnedLiveSession.mockReturnValue({ header: { cwd: "/other" } });
    await expect(createSubagentInterruptHandler(dependencies)(request)).rejects.toMatchObject({
      code: "YISHAN_PARENT_WORKSPACE_MISMATCH",
    });
  });

  it("denies non-direct, cross-workspace, non-subagent, and indirect children", async () => {
    const testCases = [
      { name: "not direct", children: [], header: { cwd: "/workspace", origin: "subagent", parentSession: "parent" } },
      {
        name: "other workspace",
        children: [{ kind: "child", id: "child", activity: "inactive", hasChildren: false, mode: "one-shot" }],
        header: { cwd: "/other", origin: "subagent", parentSession: "parent" },
      },
      {
        name: "wrong origin",
        children: [{ kind: "child", id: "child", activity: "inactive", hasChildren: false, mode: "one-shot" }],
        header: { cwd: "/workspace", origin: "user", parentSession: "parent" },
      },
      {
        name: "wrong parent",
        children: [{ kind: "child", id: "child", activity: "inactive", hasChildren: false, mode: "one-shot" }],
        header: { cwd: "/workspace", origin: "subagent", parentSession: "other" },
      },
    ];
    for (const testCase of testCases) {
      const dependencies = createDependencies();
      dependencies.subagents.listChildren.mockResolvedValue(testCase.children);
      dependencies.sessionQuery.listSessions.mockResolvedValue([
        { header: { id: "child", createdAt: 1, ...testCase.header }, live: false, persisted: true },
      ]);
      await expect(createSubagentInterruptHandler(dependencies)(request)).rejects.toMatchObject({
        code: "YISHAN_CHILD_LINEAGE_DENIED",
      });
      expect(dependencies.subagents.interrupt).not.toHaveBeenCalled();
    }
  });

  it("rejects malformed exact requests before authorization", async () => {
    const dependencies = createDependencies();
    await expect(createSubagentInterruptHandler(dependencies)({ ...request, extra: true })).rejects.toThrow();
    expect(dependencies.execution.getOwnedLiveSession).not.toHaveBeenCalled();
  });
});
