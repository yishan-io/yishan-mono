/**
 * External-apps + file-entry contracts exposed by the Files Domain
 * (desktop7 Phase 27; desktop8 Phase 29: moved from model/ to infrastructure/).
 *
 * The wire contracts stay in `@shared/contracts` (shared with the main
 * process); this module is the Files Domain's port so same-domain UI never
 * imports shared contracts directly (R1b) or its own root index by value (R17).
 */
export {
  EXTERNAL_APP_MENU_ENTRIES,
  SYSTEM_DEFAULT_APP_ID,
  SYSTEM_FILE_MANAGER_APP_ID,
  findExternalAppPreset,
  getExternalAppMenuEntries,
  isExternalAppPlatformSupported,
  isExternalAppPresetReliablyDetectableOnPlatform,
  isExternalAppPresetSupportedOnPlatform,
  type ExternalAppId,
  type ExternalAppMenuEntry,
  type ExternalAppPreset,
} from "@shared/contracts/externalApps";
export type { ExternalClipboardReadOutcome, WorkspaceFileEntry } from "@shared/contracts/rpcRequestTypes";
