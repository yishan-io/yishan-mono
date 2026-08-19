/**
 * Migration baselines recorded at desktop7 Phase 21 (2026-08-18).
 *
 * These lists freeze the CURRENT state of root `helpers` and root `ui` so the
 * migration can only shrink them. The architecture test rejects:
 *
 *   - new root Helpers files (outside ROOT_HELPERS_FILES),
 *   - new production importers of root Helpers (outside ROOT_HELPERS_IMPORTERS),
 *   - new files in `ui/hooks` (outside ROOT_UI_HOOKS_FILES),
 *   - new root UI dependency violations (outside ROOT_UI_DEP_VIOLATION_FILES),
 *     where a root UI file must not import App, Domains, API, RPC, or Helpers.
 *
 * Provisional per-file owners are recorded in ARCHITECTURE.md
 * ("Root Migration Baselines"). Remove entries here only when the owning
 * phase (desktop7 Phases 23-26) moves the file.
 */

/** Production root Helpers files at Phase 21 (25; 44 including tests). */
export const ROOT_HELPERS_FILES: string[] = [];

/** Production files that import root Helpers at Phase 21 (139). */
export const ROOT_HELPERS_IMPORTERS: string[] = [];

/** Files in `ui/hooks` at Phase 21 (4). `ui/hooks` is migration residue;
 * domain-free React behavior moves to root `renderer/hooks`. */
export const ROOT_UI_HOOKS_FILES: string[] = [];

/** Root UI files that currently import App/Domains/API/RPC/Helpers (2).
 * These must move to their owning Feature/Domain in Phases 22-26. */
export const ROOT_UI_DEP_VIOLATION_FILES: string[] = [];
