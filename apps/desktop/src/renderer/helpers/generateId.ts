/**
 * Re-exports `generateId` from the shared module.
 *
 * All renderer code can continue importing from this path. The canonical
 * implementation now lives in `shared/helpers/generateId.ts` so the main
 * process can share it without duplication.
 */
export { generateId } from "../../shared/helpers/generateId";
