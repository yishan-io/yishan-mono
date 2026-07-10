import type { AuthStatus } from "@/features/auth";

export type TerminalMeasuredSize = {
  cols: number;
  rows: number;
};

export type RuntimeSnapshot = {
  ensuredSessionId: string | null;
  ensuring: boolean;
  exited: boolean;
  starting: boolean;
  transportSessionId: string | null;
};

export function createRuntimeSnapshot(): RuntimeSnapshot {
  return {
    ensuredSessionId: null,
    ensuring: false,
    exited: false,
    starting: false,
    transportSessionId: null,
  };
}

export function canAttachTerminalTransport(args: {
  accessToken: string | null;
  sessionId: string | null;
  status: AuthStatus;
}) {
  return Boolean(args.accessToken && args.status === "authenticated" && args.sessionId);
}

export function shouldReuseTerminalTransport(existing: boolean, transportSessionId: string | null, sessionId: string) {
  return existing && transportSessionId === sessionId;
}

export function isCurrentRuntimeSnapshot(activeSnapshot: RuntimeSnapshot | null, expectedSnapshot: RuntimeSnapshot) {
  return activeSnapshot === expectedSnapshot;
}
