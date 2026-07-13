import { homedir } from "node:os";
import { resolve } from "node:path";

const PI_CODING_AGENT_DIR_ENV_KEY = "PI_CODING_AGENT_DIR";

/** Points Pi SDK state at the Yishan-managed agent directory. */
export function configureManagedPiAgentDirEnvironment(
  homeDir: string = homedir(),
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const agentDir = resolve(homeDir, ".yishan", "pi", "agent");
  environment[PI_CODING_AGENT_DIR_ENV_KEY] = agentDir;
  return agentDir;
}
