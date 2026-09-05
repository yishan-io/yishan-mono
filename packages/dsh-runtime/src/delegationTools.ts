import type { Context } from "@deepseek-ai/cordis";
import type { SandboxMode } from "@deepseek-ai/dsh-sandbox";
import { setSandboxMode } from "@deepseek-ai/dsh-sandbox-policy";
import { foldSubagentDescriptor } from "@deepseek-ai/dsh-subagent";
import { defineTool } from "@deepseek-ai/dsh-tools";

const SUBAGENT_PROVIDER = "spawn";
const SUBAGENT_MAX_DEPTH = 1;
const EXPLORE_LABEL = "Explore task";
const BUILDER_LABEL = "Build task";

/** Fixed child composition for role-specific delegation. */
export type DelegationRole = "explore" | "builder";

/** The only global tools available to delegated child roles. */
export const YISHAN_DELEGATED_TOOL_FILTER = { allow: ["bash", "skill"] } as const;
/** The explore role has an enforced read-only filesystem policy. */
export const YISHAN_EXPLORE_PERSONA =
  "Investigate the assigned task. Inspect files and report concise evidence. Your filesystem policy is enforced as read-only.";
/** The builder role can make only workspace-scoped changes when its parent permits writes. */
export const YISHAN_BUILDER_PERSONA =
  "Implement the assigned task. Make focused changes and verify them. Your filesystem policy is enforced by the runtime.";

const rolePolicies: Record<DelegationRole, { label: string; persona: string }> = {
  explore: { label: EXPLORE_LABEL, persona: YISHAN_EXPLORE_PERSONA },
  builder: { label: BUILDER_LABEL, persona: YISHAN_BUILDER_PERSONA },
};

/** Installs the fixed-role continuable delegation tools and child sandbox setup. */
export function installDelegationTools(context: Context): void {
  context.subagents.registerContinuableSetup((childContext) => {
    const child = childContext.agent;
    if (!child) throw new Error("continuable child setup requires its agent context");
    const role = getDelegationRole(child.session.events);
    if (!role) return () => undefined;

    setSandboxMode(
      child.session,
      getChildSandboxMode(role, childContext.sandboxPolicy.resolve({ session: child.session }).mode),
    );
    return () => undefined;
  });

  installDelegationTool(context, "explore");
  installDelegationTool(context, "builder");
}

function installDelegationTool(context: Context, role: DelegationRole): void {
  const policy = rolePolicies[role];
  context.tools.register(
    defineTool({
      name: `delegate_${role}`,
      description:
        role === "explore" ? "Delegate a focused read-only investigation." : "Delegate a focused implementation.",
      parameters: {
        task: {
          type: "string",
          required: true,
          description: "The complete, standalone task description for the delegated role.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            childId: { type: "string", required: true },
          },
        },
        render: (_args, result) => [{ type: "text", text: `Started ${role} child ${result.childId}` }],
        // Desktop consumes this bounded record; it must not infer child identity from model-facing text.
        presentationMeta: (_args, result) => ({ delegation: { version: 1, childId: result.childId } }),
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const parent = exec.agent;
        if (!parent) throw new Error(`delegate_${role} requires a calling agent`);

        const start = await context.subagents.startContinuable({
          provider: SUBAGENT_PROVIDER,
          label: policy.label,
          request: {
            parent,
            prompt: [{ type: "text", text: args.task }],
            maxDepth: SUBAGENT_MAX_DEPTH,
            persona: policy.persona,
            toolFilter: YISHAN_DELEGATED_TOOL_FILTER,
          },
          signal: exec.signal,
        });
        return { childId: start.childId };
      },
    }),
  );
}

function getDelegationRole(events: Parameters<typeof foldSubagentDescriptor>[0]): DelegationRole | undefined {
  const descriptor = foldSubagentDescriptor(events);
  if (descriptor?.mode !== "continuable") return undefined;
  if (descriptor.label === EXPLORE_LABEL && descriptor.persona === YISHAN_EXPLORE_PERSONA) return "explore";
  if (descriptor.label === BUILDER_LABEL && descriptor.persona === YISHAN_BUILDER_PERSONA) return "builder";
  return undefined;
}

function getChildSandboxMode(role: DelegationRole, parentMode: SandboxMode): SandboxMode {
  if (role === "explore") return "read-only";
  return parentMode === "danger-full-access" ? "workspace-write" : parentMode;
}
