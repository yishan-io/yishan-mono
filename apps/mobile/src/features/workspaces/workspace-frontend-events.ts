export type WorkspaceFrontendEventsMessage =
  | {
      type: "ready";
    }
  | {
      type: "event";
      topic: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "pong";
    };

export type WorkspaceFrontendEventsConnection = {
  nodeId: string;
  orgId: string;
  projectId: string;
  workspaceId: string;
};

export function parseWorkspaceFrontendEventsMessage(data: string): WorkspaceFrontendEventsMessage {
  return JSON.parse(data) as WorkspaceFrontendEventsMessage;
}
