/** Public daemon transport and syntax-only preference API for concrete domain boundaries. */
export {
  request,
  subscribe,
  sendBinary,
  subscribeBinary,
  subscribeConnectionStatus,
  dispose,
  type RpcClientOptions,
} from "./client";
export { PreferencesClient, preferencesClient, type PreferenceResult } from "./preferencesClient";
export type { DaemonNotification } from "./wire";
