import { readFileSync } from "node:fs";

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

import type { AgentDefinition, AgentDefinitionDiagnostic } from "./types";

const ALLOWED_THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const SUPPORTED_OVERRIDE_FIELDS = new Set(["model", "thinking"]);

/** One validated runtime patch for an existing agent definition. */
export interface AgentRuntimeOverride {
  name: string;
  model?: string;
  thinking?: ThinkingLevel;
}

/** Options for loading the optional user runtime-overrides file. */
export interface LoadAgentRuntimeOverridesOptions {
  filePath: string;
  knownAgentNames: readonly string[];
}

/** Result of loading and validating user runtime overrides. */
export interface LoadAgentRuntimeOverridesResult {
  overrides: AgentRuntimeOverride[];
  diagnostics: AgentDefinitionDiagnostic[];
}

/**
 * Loads valid patches for known agents from an optional JSON overrides file.
 */
export function loadAgentRuntimeOverrides(options: LoadAgentRuntimeOverridesOptions): LoadAgentRuntimeOverridesResult {
  const fileResult = readOverridesFile(options.filePath);
  if (fileResult.diagnostic) {
    return { overrides: [], diagnostics: [fileResult.diagnostic] };
  }
  if (fileResult.content === undefined) {
    return { overrides: [], diagnostics: [] };
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(fileResult.content);
  } catch {
    return {
      overrides: [],
      diagnostics: [{ message: "Failed to parse agent overrides file", path: options.filePath }],
    };
  }

  if (!isRecord(parsedValue)) {
    return {
      overrides: [],
      diagnostics: [{ message: "Agent overrides file must contain an object", path: options.filePath }],
    };
  }

  return validateAgentRuntimeOverrides(parsedValue, options);
}

/**
 * Applies model and thinking patches to matching agent definitions.
 */
export function applyAgentRuntimeOverrides(
  agents: AgentDefinition[],
  overrides: AgentRuntimeOverride[],
): AgentDefinition[] {
  const overridesByName = new Map(
    overrides.map((agentOverride) => [normalizeAgentName(agentOverride.name), agentOverride]),
  );

  return agents.map((agentDefinition) => {
    const agentOverride = overridesByName.get(normalizeAgentName(agentDefinition.name));
    if (!agentOverride) {
      return agentDefinition;
    }

    return {
      ...agentDefinition,
      model: agentOverride.model ?? agentDefinition.model,
      thinking: agentOverride.thinking ?? agentDefinition.thinking,
    };
  });
}

/**
 * Normalizes an agent name for case-insensitive matching.
 */
export function normalizeAgentName(name: string): string {
  return name.trim().toLowerCase();
}

function readOverridesFile(filePath: string): {
  content?: string;
  diagnostic?: AgentDefinitionDiagnostic;
} {
  try {
    return { content: readFileSync(filePath, "utf8") };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {};
    }

    return { diagnostic: { message: "Failed to read agent overrides file", path: filePath } };
  }
}

function validateAgentRuntimeOverrides(
  entries: Record<string, unknown>,
  options: LoadAgentRuntimeOverridesOptions,
): LoadAgentRuntimeOverridesResult {
  const knownNames = new Set(options.knownAgentNames.map(normalizeAgentName));
  const knownEntriesByName = new Map<string, string[]>();

  for (const entryName of Object.keys(entries)) {
    const normalizedName = normalizeAgentName(entryName);
    if (!knownNames.has(normalizedName)) {
      continue;
    }

    const matchingEntries = knownEntriesByName.get(normalizedName) ?? [];
    matchingEntries.push(entryName);
    knownEntriesByName.set(normalizedName, matchingEntries);
  }

  const diagnostics: AgentDefinitionDiagnostic[] = [];
  const overrides: AgentRuntimeOverride[] = [];
  for (const entryNames of knownEntriesByName.values()) {
    const entryName = entryNames[0];
    if (!entryName) {
      continue;
    }
    if (entryNames.length > 1) {
      diagnostics.push({ message: `Duplicate agent override for \`${entryName}\``, path: options.filePath });
      continue;
    }

    const agentOverride = validateAgentRuntimeOverride(entries[entryName], entryName, options.filePath, diagnostics);
    if (agentOverride) {
      overrides.push(agentOverride);
    }
  }

  return { overrides, diagnostics };
}

function validateAgentRuntimeOverride(
  value: unknown,
  name: string,
  filePath: string,
  diagnostics: AgentDefinitionDiagnostic[],
): AgentRuntimeOverride | undefined {
  if (!isRecord(value)) {
    diagnostics.push({ message: `Agent override \`${name}\` must be an object`, path: filePath });
    return undefined;
  }

  const unsupportedFields = Object.keys(value).filter((fieldName) => !SUPPORTED_OVERRIDE_FIELDS.has(fieldName));
  if (unsupportedFields.length > 0) {
    for (const fieldName of unsupportedFields) {
      diagnostics.push({ message: `Agent override field \`${fieldName}\` is not supported`, path: filePath });
    }
    return undefined;
  }

  const diagnosticsCountBeforeFieldValidation = diagnostics.length;
  const model = readOptionalModel(value.model, name, filePath, diagnostics);
  const thinking = readOptionalThinking(value.thinking, name, filePath, diagnostics);
  if (diagnostics.length > diagnosticsCountBeforeFieldValidation) {
    return undefined;
  }
  if (model === undefined && thinking === undefined) {
    if (value.model === undefined && value.thinking === undefined) {
      diagnostics.push({ message: `Agent override \`${name}\` must set model or thinking`, path: filePath });
    }
    return undefined;
  }

  return { name, model, thinking };
}

function readOptionalModel(
  value: unknown,
  name: string,
  filePath: string,
  diagnostics: AgentDefinitionDiagnostic[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push({
      message: `Agent override \`${name}\` field \`model\` must be a non-empty string`,
      path: filePath,
    });
    return undefined;
  }
  return value.trim();
}

function readOptionalThinking(
  value: unknown,
  name: string,
  filePath: string,
  diagnostics: AgentDefinitionDiagnostic[],
): ThinkingLevel | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !ALLOWED_THINKING_LEVELS.includes(value as ThinkingLevel)) {
    diagnostics.push({
      message: `Agent override \`${name}\` field \`thinking\` must be one of off|minimal|low|medium|high|xhigh`,
      path: filePath,
    });
    return undefined;
  }
  return value as ThinkingLevel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
