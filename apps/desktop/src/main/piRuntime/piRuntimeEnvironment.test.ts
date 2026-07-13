import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { configureManagedPiAgentDirEnvironment } from "./piRuntimeEnvironment";

describe("configureManagedPiAgentDirEnvironment", () => {
  it("overrides inherited Pi state with the Yishan-managed agent directory", () => {
    const environment: NodeJS.ProcessEnv = {
      PI_CODING_AGENT_DIR: "/tmp/legacy-pi-agent",
    };

    const agentDir = configureManagedPiAgentDirEnvironment("/Users/tester", environment);

    expect(agentDir).toBe(resolve("/Users/tester", ".yishan", "pi", "agent"));
    expect(environment.PI_CODING_AGENT_DIR).toBe(agentDir);
  });
});
