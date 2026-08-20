export type DesktopUpdateEventPayload =
  | { status: "checking"; source: "auto" | "manual" }
  | { status: "available"; source: "auto" | "manual"; version?: string }
  | { status: "not-available"; source: "manual" }
  | { status: "error"; source: "manual" | "download"; message: string }
  | {
      status: "downloading";
      version?: string;
      percent?: number;
      transferred?: number;
      total?: number;
      bytesPerSecond?: number;
    }
  | { status: "downloaded"; version?: string };
