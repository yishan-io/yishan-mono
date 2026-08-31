/** Stable provider composition APIs required by the Yishan DSH runtime. */
export { installCredentialsPlugin } from "./credentials";
export {
  assertPiAiProviderManifest,
  DIRECT_DEEPSEEK_PROVIDER,
  PI_AI_DEEPSEEK_PROVIDER,
  YISHAN_DSH_ACTIVE_PROVIDER_COUNT,
  YISHAN_DSH_ACTIVE_PROVIDER_SET,
  YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT,
  YISHAN_PI_AI_PROVIDER_ALLOWLIST,
  YISHAN_UNSUPPORTED_PI_AI_PROVIDERS,
  listProviders,
  validateProviderSelection,
  ProviderSelectionError,
  YISHAN_PI_AI_CONFIG,
  type ProviderAuthentication,
  type ProviderCatalog,
  type ProviderCatalogEntry,
  type ProviderCatalogModel,
} from "./providers";
export {
  installDshTestReplayAdapter,
  isDshTestReplayEnabled,
  YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VALUE,
  YISHAN_DSH_TEST_REPLAY_ENVIRONMENT_VARIABLE,
  YISHAN_DSH_TEST_REPLAY_MODEL,
  YISHAN_DSH_TEST_REPLAY_PROVIDER,
} from "./replay";
