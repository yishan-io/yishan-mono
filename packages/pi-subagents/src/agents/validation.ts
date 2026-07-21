import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

import type { AgentDefinition, AgentDefinitionDiagnostic, AgentDefinitionSource } from "./types";
import { WRITE_CAPABLE_TOOL_NAMES } from "./workspaceAccess";

const ALLOWED_THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

/** Built-in tool names recognized by the initial MVP loader validation. */
export const DEFAULT_ALLOWED_TOOL_NAMES = [
  "read",
  "write",
  "edit",
  "bash",
  "grep",
  "find",
  "ls",
  "glob",
  "apply_patch",
] as const;

/** Raw frontmatter shape accepted before validation and normalization. */
export interface AgentFrontmatter extends Record<string, unknown> {
  name?: unknown;
  description?: unknown;
  model?: unknown;
  thinking?: unknown;
  tools?: unknown;
  default_background?: unknown;
  max_turns?: unknown;
  timeout_seconds?: unknown;
  read_only?: unknown;
}

/** Input required to validate and normalize one agent definition file. */
export interface ValidateAgentDefinitionOptions {
  frontmatter: AgentFrontmatter;
  body: string;
  path?: string;
  source: AgentDefinitionSource;
  allowedToolNames?: readonly string[];
}

/** Result of validating one agent definition file. */
export interface ValidateAgentDefinitionResult {
  agent?: AgentDefinition;
  diagnostics: AgentDefinitionDiagnostic[];
}

/**
 * Validates and normalizes one parsed agent definition.
 */
export function validateAgentDefinition(options: ValidateAgentDefinitionOptions): ValidateAgentDefinitionResult {
  const diagnostics: AgentDefinitionDiagnostic[] = [];
  const path = options.path;
  const { frontmatter } = options;
  const allowedToolNames = new Set(options.allowedToolNames ?? DEFAULT_ALLOWED_TOOL_NAMES);

  const name = readRequiredString(frontmatter.name, "name", diagnostics, path);
  const description = readRequiredString(frontmatter.description, "description", diagnostics, path);
  const model = readOptionalString(frontmatter.model, "model", diagnostics, path);
  const thinking = readOptionalThinkingLevel(frontmatter.thinking, diagnostics, path);
  const tools = readOptionalTools(frontmatter.tools, allowedToolNames, diagnostics, path);
  const defaultBackground = readOptionalBoolean(
    frontmatter.default_background,
    "default_background",
    diagnostics,
    path,
  );
  const maxTurns = readOptionalPositiveInteger(frontmatter.max_turns, "max_turns", diagnostics, path);
  const timeoutSeconds = readOptionalPositiveNumber(frontmatter.timeout_seconds, "timeout_seconds", diagnostics, path);
  const readOnly = readOptionalBoolean(frontmatter.read_only, "read_only", diagnostics, path);
  const systemPrompt = options.body.trim();

  if (systemPrompt.length === 0) {
    diagnostics.push({ message: "Agent system prompt body is required", path });
  }

  if (!name || !description || systemPrompt.length === 0 || diagnostics.length > 0) {
    return { diagnostics };
  }

  if (tools && readOnly !== undefined) {
    const toolDerivedWorkspaceAccess = tools.some((toolName) => WRITE_CAPABLE_TOOL_NAMES.has(toolName))
      ? "write"
      : "read";
    const frontmatterWorkspaceAccess = readOnly ? "read" : "write";

    if (toolDerivedWorkspaceAccess !== frontmatterWorkspaceAccess) {
      diagnostics.push({
        message: `Agent field \`read_only\` conflicts with tool-derived workspace access: ${toolDerivedWorkspaceAccess}`,
        path,
      });
    }
  }

  return {
    agent: {
      name,
      description,
      systemPrompt,
      model,
      thinking,
      tools,
      defaultBackground,
      maxTurns,
      timeoutMs: timeoutSeconds === undefined ? undefined : timeoutSeconds * 1000,
      readOnly,
      source: options.source,
      sourcePath: path,
    },
    diagnostics,
  };
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  diagnostics: AgentDefinitionDiagnostic[],
  path?: string,
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push({ message: `Agent field \`${fieldName}\` must be a non-empty string`, path });
    return undefined;
  }

  return value.trim();
}

function readOptionalString(
  value: unknown,
  fieldName: string,
  diagnostics: AgentDefinitionDiagnostic[],
  path?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push({ message: `Agent field \`${fieldName}\` must be a non-empty string when provided`, path });
    return undefined;
  }

  return value.trim();
}

function readOptionalThinkingLevel(
  value: unknown,
  diagnostics: AgentDefinitionDiagnostic[],
  path?: string,
): ThinkingLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !ALLOWED_THINKING_LEVELS.includes(value as ThinkingLevel)) {
    diagnostics.push({ message: "Agent field `thinking` must be one of off|minimal|low|medium|high|xhigh", path });
    return undefined;
  }

  return value as ThinkingLevel;
}

function readOptionalTools(
  value: unknown,
  allowedToolNames: ReadonlySet<string>,
  diagnostics: AgentDefinitionDiagnostic[],
  path?: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedTools =
    typeof value === "string"
      ? value
          .split(",")
          .map((toolName) => toolName.trim())
          .filter(Boolean)
      : Array.isArray(value)
        ? value
            .filter((toolName): toolName is string => typeof toolName === "string")
            .map((toolName) => toolName.trim())
        : undefined;

  if (!normalizedTools || normalizedTools.length === 0) {
    diagnostics.push({ message: "Agent field `tools` must be a comma-separated string or string array", path });
    return undefined;
  }

  const unknownToolNames = normalizedTools.filter((toolName) => !allowedToolNames.has(toolName));
  if (unknownToolNames.length > 0) {
    diagnostics.push({ message: `Agent field \`tools\` contains unknown tools: ${unknownToolNames.join(", ")}`, path });
    return undefined;
  }

  return normalizedTools;
}

function readOptionalBoolean(
  value: unknown,
  fieldName: string,
  diagnostics: AgentDefinitionDiagnostic[],
  path?: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    diagnostics.push({ message: `Agent field \`${fieldName}\` must be a boolean when provided`, path });
    return undefined;
  }

  return value;
}

function readOptionalPositiveInteger(
  value: unknown,
  fieldName: string,
  diagnostics: AgentDefinitionDiagnostic[],
  path?: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    diagnostics.push({ message: `Agent field \`${fieldName}\` must be a positive integer when provided`, path });
    return undefined;
  }

  return value;
}

function readOptionalPositiveNumber(
  value: unknown,
  fieldName: string,
  diagnostics: AgentDefinitionDiagnostic[],
  path?: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push({ message: `Agent field \`${fieldName}\` must be a positive number when provided`, path });
    return undefined;
  }

  return value;
}
