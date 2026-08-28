import { describe, expect, it } from "vitest";
import type { AgentSessionLineageResult } from "../daemon/daemonAgentTypes";
import { projectDshLineageSubagents } from "./agentChatDshLineage";

describe("projectDshLineageSubagents", () => {
  it("projects only live, active direct children with runtime-scoped identities", () => {
    const lineage: AgentSessionLineageResult = {
      runtime: "dsh",
      rootSessionId: "parent-1",
      mode: "children",
      children: [
        {
          sessionId: "shared-id",
          parentSessionId: "parent-1",
          origin: "subagent",
          delegationDepth: 1,
          relativeDepth: 1,
          live: true,
          persisted: true,
          activity: "running",
          label: "Research",
        },
        {
          sessionId: "inactive-child",
          parentSessionId: "parent-1",
          origin: "subagent",
          delegationDepth: 1,
          relativeDepth: 1,
          live: true,
          persisted: true,
          activity: "inactive",
        },
        {
          sessionId: "not-live-child",
          parentSessionId: "parent-1",
          origin: "subagent",
          delegationDepth: 1,
          relativeDepth: 1,
          live: false,
          persisted: true,
        },
        {
          sessionId: "nested-child",
          parentSessionId: "other-child",
          origin: "subagent",
          delegationDepth: 2,
          relativeDepth: 2,
          live: true,
          persisted: true,
        },
        {
          sessionId: "fallback-child",
          parentSessionId: "parent-1",
          origin: "subagent",
          delegationDepth: 1,
          relativeDepth: 1,
          live: true,
          persisted: true,
        },
      ],
    };

    expect(projectDshLineageSubagents(lineage)).toEqual([
      {
        rowId: "dsh:shared-id",
        runtime: "dsh",
        agentName: "Research",
        childSessionId: "shared-id",
        title: "Research",
        promptSummary: "Research",
        state: "running",
      },
      {
        rowId: "dsh:fallback-child",
        runtime: "dsh",
        agentName: "DSH subagent",
        childSessionId: "fallback-child",
        title: "DSH subagent",
        promptSummary: "DSH subagent",
        state: "running",
      },
    ]);
  });
});
