/**
 * Re-exports `getErrorMessage` from the shared module.
 *
 * All renderer code can continue importing from this path. The canonical
 * implementation now lives in `shared/helpers/errorHelpers.ts` so the main
 * process can share it without duplication.
 */
export { getErrorMessage, isWorkspaceNotFoundError } from "../../shared/helpers/errorHelpers";
