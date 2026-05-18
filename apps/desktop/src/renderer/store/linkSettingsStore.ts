/**
 * @deprecated Import from `layoutStore` instead.
 * `linkTarget` and `setLinkTarget` now live in `layoutStore`.
 */
export { layoutStore as linkSettingsStore } from "./layoutStore";
export type { LinkTarget } from "./layoutStore";

/** @deprecated Key is no longer used — link setting is persisted inside layoutStore. */
export const LINK_SETTINGS_STORE_STORAGE_KEY = "yishan-link-settings-store";
