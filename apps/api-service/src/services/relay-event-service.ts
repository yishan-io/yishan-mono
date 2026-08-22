import type { ServiceConfig } from "@/types";

/** Maximum duration allowed for a best-effort relay publish request. */
export const RELAY_EVENT_TIMEOUT_MS = 5_000;

/** Creates the abort signal used to bound an individual relay publish request. */
export function createRelayEventTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(RELAY_EVENT_TIMEOUT_MS);
}

type WorkspaceSnapshotChangeInput = {
  organizationId: string;
  resource: "project" | "workspace";
  change: "created" | "updated" | "deleted" | "closed";
  projectId?: string;
  workspaceId?: string;
  sourceNodeId?: string;
};

type TimeoutSignalFactory = () => AbortSignal;

/** Publishes best-effort org-scoped invalidation events to the relay. */
export class RelayEventService {
  constructor(
    private readonly config: ServiceConfig,
    private readonly createTimeoutSignal: TimeoutSignalFactory = createRelayEventTimeoutSignal,
  ) {}

  async publishWorkspaceSnapshotChanged(input: WorkspaceSnapshotChangeInput): Promise<void> {
    const relayUrl = this.config.relayUrl?.trim();
    const relayApiToken = this.config.relayApiToken?.trim();
    if (!relayUrl || !relayApiToken) {
      return;
    }

    await this.postRelayEvent("/api/v1/org-events", input);
  }

  private async postRelayEvent(path: string, body: Record<string, unknown>): Promise<void> {
    const relayUrl = this.config.relayUrl?.trim();
    const relayApiToken = this.config.relayApiToken?.trim();
    if (!relayUrl || !relayApiToken) {
      return;
    }

    try {
      const response = await fetch(new URL(path, relayUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${relayApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.warn(`[RelayEventService] Relay event publish failed: ${response.status} ${responseText}`);
      }
    } catch (error) {
      console.warn("[RelayEventService] Relay event publish failed", error);
    }
  }
}
