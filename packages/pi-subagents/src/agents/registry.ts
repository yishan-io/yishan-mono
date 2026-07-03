import { type LoadAgentDefinitionsOptions, loadAgentDefinitions, normalizeAgentName } from "./loader";
import type { AgentDefinition, AgentDefinitionDiagnostic, AgentRegistrySnapshot } from "./types";

/**
 * In-memory registry of all resolved agent definitions visible to the package.
 */
export class AgentRegistry {
  private snapshot: AgentRegistrySnapshot = { agents: [], diagnostics: [] };

  constructor(private readonly options: LoadAgentDefinitionsOptions) {}

  /** Reloads agent definitions from disk and returns the current snapshot. */
  reload(): AgentRegistrySnapshot {
    this.snapshot = loadAgentDefinitions(this.options);
    return this.snapshot;
  }

  /** Returns all resolved agent definitions. */
  list(): AgentDefinition[] {
    return [...this.snapshot.agents];
  }

  /** Returns all load diagnostics gathered during the latest reload. */
  getDiagnostics(): AgentDefinitionDiagnostic[] {
    return [...this.snapshot.diagnostics];
  }

  /** Looks up one agent definition by case-insensitive name. */
  getByName(name: string): AgentDefinition | undefined {
    const normalizedName = normalizeAgentName(name);
    return this.snapshot.agents.find((agentDefinition) => normalizeAgentName(agentDefinition.name) === normalizedName);
  }
}
