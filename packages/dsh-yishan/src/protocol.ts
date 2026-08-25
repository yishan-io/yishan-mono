/** The initial version of Yishan's DSH extension protocol. */
export const YISHAN_PROTOCOL_VERSION = 1;

const YISHAN_METHOD_PREFIX = `yishan.v${YISHAN_PROTOCOL_VERSION}.`;

/** Versioned session methods that extend DSH's stock SDK JSON-RPC surface. */
export const YISHAN_METHODS = {
  bind: yishanMethod("session.bind"),
  cancel: yishanMethod("session.cancel"),
  dispose: yishanMethod("session.dispose"),
  flush: yishanMethod("session.flush"),
  list: yishanMethod("session.list"),
  read: yishanMethod("session.read"),
  resume: yishanMethod("session.resume"),
  interactionRespond: yishanMethod("interaction.respond"),
} as const;

/** Runtime-to-daemon requests sent over the bidirectional JSON-RPC peer. */
export const YISHAN_REVERSE_METHODS = {
  capabilityRequest: yishanMethod("capability.request"),
  interactionRequest: yishanMethod("interaction.request"),
} as const;

/** Durable/runtime notifications emitted in addition to stock SDK events. */
export const YISHAN_NOTIFICATIONS = {
  durableCursor: yishanMethod("session.durable-cursor"),
  transcriptReset: yishanMethod("session.transcript-reset"),
} as const;

/** Returns the versioned wire method name for one Yishan-only capability. */
export function yishanMethod(capabilityName: string): string {
  if (capabilityName.length === 0) throw new TypeError("capability name is required");
  return `${YISHAN_METHOD_PREFIX}${capabilityName}`;
}
