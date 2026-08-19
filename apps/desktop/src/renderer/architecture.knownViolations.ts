/**
 * Allowlist data for `architecture.test.ts` (Desktop renderer dependency rules).
 *
 * Rows are baselined violations that later Domain phases remove. Every row
 * carries the tag of the Domain phase that owns its removal (`D3`-`D17`).
 * The architecture test fails on stale rows and on rows tagged with a
 * completed phase (`COMPLETED_PHASES`), so keep this list in sync with the
 * code. Re-tag a row when its removal phase changes; remove a row in the
 * change that fixes the violation.
 *
 * Phase D2 (Domains plan) re-owned the list: terminology changed from
 * Feature module to Domain, the allowlist mechanism changed from a single
 * `CURRENT_PHASE` to per-row owning phases, and three new rules were added:
 *
 *   - R14-cross-domain-deep: a cross-Domain import must go through the
 *     Domain's public `index.ts` (or the Domain root); deep imports into
 *     another Domain's internals are violations.
 *   - R15-app-from-domain: Domain code must not import `app`.
 *   - R16-app-deep-into-domain: App code must not deep-import a Domain.
 *
 * Phase D2 also re-tagged the Phase 16 baseline rows: R6/R7 rows moved to
 * the owning Domain phase, R9 ui rows to D17 (Final Closure removes root ui
 * product behavior).
 */

export type RuleName =
  | "R1-value-api-rpc"
  | "R1-main"
  | "R1b-shared-contracts"
  | "R3"
  | "R4"
  | "R5-cross-feature-internal"
  | "R6-state-layer"
  | "R7-model-layer"
  | "R8-infra-layer"
  | "R9-ui-components"
  | "R10-workspace-workbench"
  | "R11-workbench-product-import"
  | "R12-store-action-promise"
  | "R13-getter-forwarding-action-file"
  | "R14-cross-domain-deep"
  | "R15-app-from-domain"
  | "R16-app-deep-into-domain"
  | "R17-domain-self-index"
  | "R18-wildcard-domain-index"
  | "R19-rpc-whitelist"
  | "R20-layer-transport"
  | "R21-events-app-domain"
  | "R22-shared-renderer-import"
  | "R23-removed-root-capabilities"
  | "R24-platform-app-domain"
  | "R25-forbidden-domain-bucket"
  | "R26-technical-nested-index";

export type KnownViolation = { rule: RuleName; file: string; phase: string };

/**
 * Phases whose allowlist rows must already be removed. Bump this when a
 * Desktop phase completes; the test rejects rows tagged with any of these
 * phases, which prevents allowlist rows for completed phases.
 */
export const COMPLETED_PHASES = [
  "P16",
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
  "D9",
  "D10",
  "D11",
  "D12",
  "D13",
  "D14",
  "D15",
  "D16",
  "P21",
  "P22",
  "P23",
  "P24",
  "P25",
  "P26",
  "P27",
] as const;

export const KNOWN_VIOLATIONS: KnownViolation[] = [
  // ---- R6-state-layer (owning phase = the Domain that owns the store) ----
  // desktop6-adjust W1: Workspace Store types moved to Workspace State; the
  // store boundary keeps transport DTO references (baselined like the other
  // workspace projection store rows). actions.localFolders/actions.workspaces
  // rows removed — those files no longer import transport directly.
  // desktop6-adjust W4: git projections moved from the Workspace feature to
  // the Git feature; the transport-DTO boundary on the store keeps the same
  // baselined R6 row (was domains/workspace/state/workspaceProjectionStore.ts).
  // ---- R7-model-layer (owning phase = the Domain that owns the model) ----
  // desktop6-adjust W1: workbench/model/types.ts row removed — the generic
  // types file no longer imports transport/zustand (tab types moved to
  // tabTypes.ts, Workspace Store types moved to Workspace State).
  // desktop6-adjust W4: snapshotReconciler no longer imports git transport
  // types; it remains the workspace/project DTO boundary. D8 removed its
  // workspace state import (R7 occurrence) and project deep import (R14);
  // the api/types transport boundary keeps this R7 row (baseline R7 = 2).
  // ---- R9-ui-components (owning phase = D17 Final Closure removes root ui behavior) ----
  // ---- R14-cross-domain-deep (Phase D2 baseline; owning phase = importing Domain) ----
  // ---- R15-app-from-domain (Phase D2 baseline; owning phase = importing Domain) ----
];
