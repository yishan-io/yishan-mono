/**
 * @deprecated Import from `sessionStore` instead.
 * `authStore` is now a re-export of `sessionStore` — `isAuthenticated`,
 * `authStatusResolved`, and `setAuthState` live there.
 * This shim exists only to avoid breaking test files that call
 * `authStore.setState(...)` directly.
 */
export { sessionStore as authStore } from "./sessionStore";

/** @deprecated Key is no longer used — auth state is persisted inside sessionStore. */
export const AUTH_STORE_STORAGE_KEY = "yishan-auth-store";
