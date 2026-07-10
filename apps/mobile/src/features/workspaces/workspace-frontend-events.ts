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
