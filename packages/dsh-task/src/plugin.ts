import type { Context } from "@deepseek-ai/cordis";
import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";
import type {} from "@yishan-io/dsh-workspace";

import type { TaskCapabilityRequest } from "./client";
import { registerTaskDocumentTools } from "./documentTools";
import { registerTaskRecordTools } from "./taskRecordTools";
import { registerTaskTemplateTool } from "./templateTool";

export const name = "dsh-task";
export const inject = ["daemonBridge", "tools", "yishanWorkspaceBindingHost"];

export function apply(context: Context): void {
  registerTaskTools(context, context.daemonBridge, (sessionId) =>
    context.yishanWorkspaceBindingHost.resolveCapabilityIdentity(sessionId),
  );
}

export function registerTaskTools(
  context: Context,
  transport: CapabilityTransport<TaskCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
): void {
  registerTaskRecordTools(context, transport, resolveIdentity);
  registerTaskDocumentTools(context, transport, resolveIdentity);
  registerTaskTemplateTool(context, transport, resolveIdentity);
}
