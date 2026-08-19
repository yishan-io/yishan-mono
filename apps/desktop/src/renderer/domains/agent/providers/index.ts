/**
 * providers module — internal module API (desktop9).
 */
export type { PiProviderAuthMode, PiProviderCatalogEntry } from "./piProviders";
export {
  PI_PROVIDER_CATALOG,
  getPiProviderCatalogEntry,
  isKnownPiProviderId,
  getPiProviderDisplayName,
  isPiProviderApiKeyCapable,
  isPiProviderOAuthCapable,
  isPiProviderSubscriptionCapable,
  getPiProviderPinEnv,
} from "./piProviders";
export type { ModelPickerOption, ModelPickerProviderGroup, ModelIdParts } from "./modelPicker";
export {
  FALLBACK_MODEL_PROVIDER_ID,
  FALLBACK_MODEL_PROVIDER_NAME,
  splitModelId,
  stripProviderPrefix,
  buildModelPickerOption,
  groupModelPickerOptionsByProvider,
} from "./modelPicker";
export type { ThinkingLevel } from "./agentThinkingLevels";
export {
  THINKING_LEVELS,
  getSupportedThinkingLevels,
  isThinkingLevelSupported,
  clampThinkingLevel,
  formatSupportedThinkingLevels,
} from "./agentThinkingLevels";
export type { DesktopAgentKind } from "./agentSettings";
export {
  SUPPORTED_DESKTOP_AGENT_KINDS,
  DEFAULT_AGENT_COMMANDS,
  isDesktopAgentKind,
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION,
  createDefaultAgentInUseByKind,
} from "./agentSettings";
