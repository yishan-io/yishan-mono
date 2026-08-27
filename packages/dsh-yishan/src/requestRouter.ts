import { YISHAN_PROTOCOL_VERSION } from "./protocol";
import { YishanUnsupportedMethodError } from "./sessionHandler";

/** Handler shape shared by stock SDK and Yishan extension request dispatch. */
export type JsonRpcRequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/** Stable in-process code for stock execution paths denied by the Yishan runtime boundary. */
export type YishanRequestPolicyErrorCode = "YISHAN_STOCK_SESSION_EXECUTION_DENIED";

/**
 * Stable stdio error-message prefix for stock session execution policy denials.
 *
 * The pinned `JsonRpcLineTransport` serializes rejected handlers as `-32603`
 * errors without JSON-RPC error data. Stdio clients must match this prefix.
 */
export const YISHAN_REQUEST_POLICY_DENIAL_MESSAGE = "YISHAN_STOCK_SESSION_EXECUTION_DENIED";

/** Raised when stock DSH session execution would bypass Yishan session ownership. */
export class YishanRequestPolicyError extends Error {
  /** Stable in-process policy-denial code; it is not serialized as JSON-RPC error data. */
  readonly code: YishanRequestPolicyErrorCode = YISHAN_REQUEST_POLICY_DENIAL_MESSAGE;

  /** Creates a stock session execution policy denial. */
  constructor(method: string) {
    super(`${YISHAN_REQUEST_POLICY_DENIAL_MESSAGE}: stock DSH session execution is denied by Yishan policy: ${method}`);
    this.name = "YishanRequestPolicyError";
  }
}

const YISHAN_NAMESPACE_PREFIX = "yishan.";
const YISHAN_VERSION_PREFIX = `yishan.v${YISHAN_PROTOCOL_VERSION}.`;
const STOCK_SESSION_NEW_METHOD = "session/new";
const STOCK_SESSION_PROMPT_METHOD = "session/prompt";

/** Combines stock DSH SDK methods and Yishan extensions behind one stdio owner. */
export function createRequestRouter(
  stockHandler: JsonRpcRequestHandler,
  extensionHandler: JsonRpcRequestHandler,
  ownsSession: (sessionId: string) => boolean = () => false,
): JsonRpcRequestHandler {
  return (method, params) => {
    if (method.startsWith(YISHAN_VERSION_PREFIX)) return extensionHandler(method, params);
    if (method.startsWith(YISHAN_NAMESPACE_PREFIX)) {
      return Promise.reject(new YishanUnsupportedMethodError(method));
    }
    if (method === STOCK_SESSION_NEW_METHOD) return Promise.reject(new YishanRequestPolicyError(method));
    if (method === STOCK_SESSION_PROMPT_METHOD && !isOwnedStockPrompt(params, ownsSession)) {
      return Promise.reject(new YishanRequestPolicyError(method));
    }
    return stockHandler(method, params);
  };
}

function isOwnedStockPrompt(params: Record<string, unknown>, ownsSession: (sessionId: string) => boolean): boolean {
  return typeof params.sessionId === "string" && params.sessionId.length > 0 && ownsSession(params.sessionId);
}
