export type DaemonRelayStatus = {
  enabled: boolean;
  url: string;
  connected: boolean;
  connectedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
};

export type DaemonInfoResult = {
  version: string;
  daemonId: string;
  wsUrl: string;
  relay?: DaemonRelayStatus;
};

export type DaemonRestartResult = { success: true; daemonInfo: DaemonInfoResult } | { success: false; error: string };

/** Selects the daemon log scope to read from the active CLI profile. */
export type DaemonLogSource = "system" | "account";

export type DaemonLogResult = { ok: true; content: string } | { ok: false; error: string };
