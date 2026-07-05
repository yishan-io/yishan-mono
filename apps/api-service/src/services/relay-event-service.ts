import type { ServiceConfig } from "@/types";

type WorkspaceSnapshotChangeInput = {
  organizationId: string;
  resource: "project" | "workspace";
  change: "created" | "updated" | "deleted" | "closed";
  projectId?: string;
  workspaceId?: string;
  sourceNodeId?: string;
};

/** Publishes best-effort org-scoped invalidation events to the relay. */
export class RelayEventService {
  constructor(private readonly config: ServiceConfig) {}

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
