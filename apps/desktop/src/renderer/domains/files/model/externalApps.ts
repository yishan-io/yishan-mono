/**
 * External-apps + file-entry contracts exposed by the Files Domain
 * (desktop7 Phase 27).
 *
 * The wire contracts stay in `@shared/contracts` (shared with the main
 * process); this module is the Files Domain's internal re-export so
 * same-domain UI never imports the root index or shared contracts directly.
 */
export {
  EXTERNAL_APP_MENU_ENTRIES,
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
