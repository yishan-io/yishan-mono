import type { DispatchMessage } from "@/scheduled/queue";
import type { JobEvaluatorService } from "@/services/job-evaluator-service";

export type RelayDispatchEnv = {
  RELAY_URL?: string;
  RELAY_API_TOKEN?: string;
};

const RELAY_DISPATCH_PATH = "/api/v1/dispatch";

type RelayDispatchResponse = {
  ok: boolean;
  runId?: string;
  status?: string;
  reason?: string;
  detail?: string;
};

export async function handleDispatchMessage(
  jobEvaluatorService: JobEvaluatorService,
  env: RelayDispatchEnv,
  msg: DispatchMessage,
): Promise<void> {
  const scheduledFor = new Date(msg.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) {
    console.warn(`[queue-consumer] Ignored run ${msg.runId} due to invalid scheduledFor timestamp`);
    return;
  }

  const run = await jobEvaluatorService.getPendingRunForDispatch({
    runId: msg.runId,
    jobId: msg.jobId,
    nodeId: msg.nodeId,
    scheduledFor,
  });

  if (!run) {
    console.warn(`[queue-consumer] Ignored stale/invalid run ${msg.runId}`);
    return;
  }

  const relayURL = env.RELAY_URL;
  if (!relayURL) {
    throw new Error("RELAY_URL not configured");
  }

  const relayResp = await fetch(`${relayURL}${RELAY_DISPATCH_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.RELAY_API_TOKEN ? { Authorization: `Bearer ${env.RELAY_API_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      runId: msg.runId,
      jobId: msg.jobId,
      nodeId: msg.nodeId,
      scheduledFor: msg.scheduledFor,
      payload: {
        agentKind: msg.agentKind,
        prompt: msg.prompt,
        model: msg.model,
        command: msg.command,
        projectPath: await jobEvaluatorService.findProjectPathForNode({
          projectId: msg.projectId,
          nodeId: msg.nodeId,
        }),
      },
    }),
  });

  if (!relayResp.ok) {
    const text = await relayResp.text();
    throw new Error(`relay dispatch failed: ${relayResp.status} ${text}`);
  }

  const relayPayload = (await relayResp.json()) as RelayDispatchResponse;
  if (relayPayload.ok) {
    return;
  }

  if (relayPayload.reason === "node_offline") {
    await jobEvaluatorService.markRunSkippedOffline({
      runId: msg.runId,
      nodeId: msg.nodeId,
      reason: relayPayload.detail ?? "node offline",
    });
    return;
  }

  throw new Error(`relay dispatch rejected: ${relayPayload.reason ?? "unknown"}`);
}
