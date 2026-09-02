import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";
import { describe, expect, it, vi } from "vitest";

import { type TaskCapabilityRequest, TaskClient, buildTaskDescription } from "./client";

const identity: CapabilityIdentity = { sessionId: "session-1", workspaceId: "workspace-1", generation: 2 };
const task = {
  id: "task-1",
  projectId: "project-1",
  title: "Build task plugin",
  description: "Description",
  status: "new" as const,
  priority: "medium" as const,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  completedAt: null,
  tags: ["dsh"],
  tagRefs: [{ id: "tag-1", name: "dsh" }],
};

describe("TaskClient", () => {
  it.each([
    [
      "start",
      [{ title: "Build", goal: "Ship it" }],
      "task.start",
      { title: "Build", description: "## Goal\n\nShip it" },
      task,
    ],
    ["list", [{ status: ["new", "progressing"] }], "task.list", { status: ["new", "progressing"] }, { tasks: [task] }],
    ["search", [{ query: "plugin" }], "task.search", { query: "plugin" }, { tasks: [{ ...task, rank: -1 }] }],
    ["read", [{ id: "task-1" }], "task.read", { id: "task-1" }, { document: "task", task }],
    ["update", [{ id: "task-1", status: "progressing" }], "task.update", { id: "task-1", status: "progressing" }, task],
    [
      "write",
      [{ id: "task-1", document: "plan", content: "Plan" }],
      "task.write",
      { id: "task-1", document: "plan", content: "Plan" },
      { id: "task-1", document: "plan" },
    ],
    [
      "appendNote",
      [{ id: "task-1", content: "Note" }],
      "task.appendNote",
      { id: "task-1", content: "Note" },
      { id: "task-1" },
    ],
    [
      "finish",
      [{ id: "task-1", outcome: "Done" }],
      "task.finish",
      { id: "task-1", outcome: "Done" },
      { id: "task-1", status: "done" },
    ],
    ["templateRead", [], "task.templateRead", {}, { templates: [], agentDefaultId: "" }],
  ])("routes %s through its domain operation", async (method, arguments_, operation, input, response) => {
    const transport = createTransport(response);
    const client = new TaskClient(transport, identity, new AbortController().signal);

    await expect(
      (client[method as keyof TaskClient] as (...values: unknown[]) => Promise<unknown>)(...arguments_),
    ).resolves.toEqual(response);
    expect(getOnlyRequest(transport)).toMatchObject({ ...identity, operation, input });
  });

  it("rejects malformed daemon results", async () => {
    const client = new TaskClient(createTransport({ tasks: "invalid" }), identity, new AbortController().signal);
    await expect(client.list({})).rejects.toThrow();
  });
});

describe("buildTaskDescription", () => {
  it("composes structured task sections", () => {
    expect(buildTaskDescription({ goal: "Goal", context: "Context", acceptanceCriteria: ["One", "Two"] })).toBe(
      "## Goal\n\nGoal\n\n## Context\n\nContext\n\n## Acceptance Criteria\n\n- One\n- Two",
    );
  });

  it("rejects mixed description styles", () => {
    expect(() => buildTaskDescription({ description: "Direct", goal: "Goal" })).toThrow("not both");
  });
});

function createTransport(response: unknown): CapabilityTransport<TaskCapabilityRequest> {
  return { requestCapability: vi.fn(async () => response) };
}

function getOnlyRequest(transport: CapabilityTransport<TaskCapabilityRequest>): TaskCapabilityRequest {
  const requests = vi.mocked(transport.requestCapability).mock.calls;
  const request = requests[0]?.[0];
  if (request === undefined) throw new Error("expected one task capability request");
  expect(requests).toHaveLength(1);
  return request;
}
