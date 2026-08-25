import { YISHAN_PROTOCOL_VERSION } from "./protocol";

/** Handler shape shared by stock SDK and Yishan extension request dispatch. */
export type JsonRpcRequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

const YISHAN_NAMESPACE_PREFIX = "yishan.";
const YISHAN_VERSION_PREFIX = `yishan.v${YISHAN_PROTOCOL_VERSION}.`;

/** Combines stock DSH SDK methods and Yishan extensions behind one stdio owner. */
export function createRequestRouter(
  stockHandler: JsonRpcRequestHandler,
  extensionHandler: JsonRpcRequestHandler,
): JsonRpcRequestHandler {
  return (method, params) => {
    if (method.startsWith(YISHAN_VERSION_PREFIX)) return extensionHandler(method, params);
    if (method.startsWith(YISHAN_NAMESPACE_PREFIX)) {
      return Promise.reject(new Error(`unsupported Yishan protocol method: ${method}`));
    }
    return stockHandler(method, params);
  };
}
