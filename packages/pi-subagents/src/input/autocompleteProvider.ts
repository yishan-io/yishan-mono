import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { fuzzyFilter } from "@earendil-works/pi-tui";

import { normalizeAgentName } from "../agents/loader";
import type { AgentDefinition } from "../agents/types";

const AGENT_TOKEN_PREFIX = "@agent:";
const AGENT_RESULT_LIMIT = 20;
const AGENT_DESCRIPTION_PREFIX = "Agent · ";

/**
 * Creates one autocomplete provider that layers agent suggestions on top of the current Pi provider.
 */
export function createAgentAutocompleteProvider(
  current: AutocompleteProvider,
  agents: AgentDefinition[],
): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const lineText = lines[cursorLine] ?? "";
      const textBeforeCursor = lineText.slice(0, cursorCol);
      const directQuery = extractDirectAgentQuery(textBeforeCursor);
      if (directQuery) {
        return {
          items: buildAgentAutocompleteItems(agents, directQuery.query, { includeFuzzy: true }),
          prefix: directQuery.prefix,
        };
      }

      const mixedQuery = extractMixedAtQuery(textBeforeCursor);
      if (!mixedQuery) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const fileSuggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
      const agentSuggestions = buildAgentAutocompleteItems(agents, mixedQuery.query, { includeFuzzy: false });

      if (fileSuggestions === null && agentSuggestions.length === 0) {
        return null;
      }

      if (fileSuggestions === null) {
        return { items: agentSuggestions, prefix: mixedQuery.prefix };
      }

      if (agentSuggestions.length === 0) {
        return fileSuggestions;
      }

      return {
        items: mergeAutocompleteItems(agentSuggestions, fileSuggestions.items, mixedQuery.query),
        prefix: fileSuggestions.prefix,
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      if (item.value.startsWith(AGENT_TOKEN_PREFIX)) {
        return applyAgentCompletion(lines, cursorLine, cursorCol, item, prefix);
      }

      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

/**
 * Builds the visible autocomplete items for agent suggestions.
 */
export function buildAgentAutocompleteItems(
  agents: AgentDefinition[],
  query: string,
  options: { includeFuzzy: boolean },
): AutocompleteItem[] {
  const normalizedQuery = normalizeAgentName(query);
  if (normalizedQuery.length === 0) {
    return agents.slice(0, AGENT_RESULT_LIMIT).map((agent) => ({
      value: `${AGENT_TOKEN_PREFIX}${agent.name} `,
      label: agent.name,
      description: `${AGENT_DESCRIPTION_PREFIX}${agent.description}`,
    }));
  }

  const exactMatches = agents.filter((agent) => normalizeAgentName(agent.name) === normalizedQuery);
  const prefixMatches = agents.filter(
    (agent) =>
      normalizeAgentName(agent.name).startsWith(normalizedQuery) && normalizeAgentName(agent.name) !== normalizedQuery,
  );
  const fuzzyMatches =
    options.includeFuzzy && exactMatches.length === 0 && prefixMatches.length === 0
      ? fuzzyFilter(agents, normalizedQuery, (agent) => `${agent.name} ${agent.description}`)
      : [];

  return [...exactMatches, ...prefixMatches, ...fuzzyMatches].slice(0, AGENT_RESULT_LIMIT).map((agent) => ({
    value: `${AGENT_TOKEN_PREFIX}${agent.name} `,
    label: agent.name,
    description: `${AGENT_DESCRIPTION_PREFIX}${agent.description}`,
  }));
}

function extractDirectAgentQuery(textBeforeCursor: string): { prefix: string; query: string } | null {
  const match = textBeforeCursor.match(/(?:^|[ \t])@agent:([^\s@]*)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: `${AGENT_TOKEN_PREFIX}${match[1] ?? ""}`,
    query: match[1] ?? "",
  };
}

function extractMixedAtQuery(textBeforeCursor: string): { prefix: string; query: string } | null {
  const match = textBeforeCursor.match(/(?:^|[ \t])@([^\s@]*)$/);
  if (!match) {
    return null;
  }

  const query = match[1] ?? "";
  if (query.startsWith("agent:")) {
    return null;
  }

  return {
    prefix: `@${query}`,
    query,
  };
}

function mergeAutocompleteItems(
  agentItems: AutocompleteItem[],
  fileItems: AutocompleteItem[],
  query: string,
): AutocompleteItem[] {
  if (query.length === 0) {
    return [...agentItems, ...fileItems];
  }

  const normalizedQuery = normalizeAgentName(query);
  const hasExactAgentMatch = agentItems.some((item) => normalizeAgentName(item.label) === normalizedQuery);
  const hasPrefixAgentMatch = agentItems.some((item) => normalizeAgentName(item.label).startsWith(normalizedQuery));

  if (hasExactAgentMatch || hasPrefixAgentMatch) {
    return [...agentItems, ...fileItems];
  }

  return [...fileItems, ...agentItems];
}

function applyAgentCompletion(
  lines: string[],
  cursorLine: number,
  cursorCol: number,
  item: AutocompleteItem,
  prefix: string,
): { lines: string[]; cursorLine: number; cursorCol: number } {
  const nextLines = [...lines];
  const currentLine = nextLines[cursorLine] ?? "";
  const prefixStartIndex = Math.max(0, cursorCol - prefix.length);
  const nextLine = `${currentLine.slice(0, prefixStartIndex)}${item.value}${currentLine.slice(cursorCol)}`;
  nextLines[cursorLine] = nextLine;

  return {
    lines: nextLines,
    cursorLine,
    cursorCol: prefixStartIndex + item.value.length,
  };
}
