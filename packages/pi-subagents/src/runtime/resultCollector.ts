import type { AgentResult } from "../agents/types";

/**
 * Formats multiple agent results into the structured block form injected back into the main agent.
 */
export function formatResultCollectorOutput(results: AgentResult[]): string {
  return results
    .map((result) => {
      const payload = escapeXmlText(result.responseText ?? result.error ?? "");
      const agentName = escapeXmlAttribute(result.agentName);
      return `<subagent name="${agentName}">\n${payload}\n</subagent>`;
    })
    .join("\n\n");
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
