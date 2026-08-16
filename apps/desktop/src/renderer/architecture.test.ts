// @vitest-environment node

/**
 * Architecture test — Desktop renderer dependency rules (refactor Phase 1).
 *
 * Enforces the Phase 1 dependency contract from `.my-context/architecture/refactor/desktop2.md`:
 *
 *   - Rule 1 (UI → transport): views/, components/, hooks/ must not VALUE-import
 *     renderer/api/* or renderer/rpc/*, must not import `electron`, and must not
 *     import main-process modules (main/ or @main/) in any form.
 *   - Rule 1b (@shared/contracts DTOs): report-only in Phase 1 — records the
 *     surface for Phases 3/6/7. Not failing yet.
 *   - Rule 2 (store → transport/commands): store/ must not VALUE-import
 *     rpc/, api/, electron, or commands/.
 *   - Rule 3 (pure domain → framework): store/tabs/ and store/split-pane/ must
 *     not import react, zustand, rpc/, api/, commands/, or electron.
 *   - Rule 4 (commands → views): commands/ must not import views/ or components/.
 *
 * KNOWN_VIOLATIONS is the Phase 0 baseline (from
 * `.my-context/architecture/refactor/desktop-baseline/cross-layer-dependency-index.md`).
 * Existing violations are allowed; NEW violations fail the test with file + rule +
 * phase tag. As later phases fix entries, remove them from this list.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const RENDERER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const SHARED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../shared");
const MAIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../main");

type RuleName = "R1-value-api-rpc" | "R1-main" | "R1b-shared-contracts" | "R2" | "R3" | "R4";
type KnownViolation = { rule: RuleName; file: string; phase: string };

/**
 * Phase 0 baseline. Remove rows as later phases fix them.
 * Phase tags come from the cross-layer-dependency-index.
 */
const KNOWN_VIOLATIONS: KnownViolation[] = [
  // ---- Rule 1: UI value-imports of api/rpc (cross-layer index §1) ----
  { rule: "R1-value-api-rpc", file: "views/LoginView.tsx", phase: "P7" },
  { rule: "R1-value-api-rpc", file: "views/layout/ApplicationRouterView.tsx", phase: "P7" },
  { rule: "R1-value-api-rpc", file: "views/settings/LanguageSettingsView.tsx", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/NodesSettingsView.tsx", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/MemberSettingsView.tsx", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/PendingInvitesSection.tsx", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/ServiceTokenSettingsView.tsx", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/MemorySettingsView.tsx", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/ComputerUseSettingsView.tsx", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/daemon/daemonSettings/useQuitOnExitSetting.ts", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/daemon/daemonSettings/useDaemonConnectionState.ts", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/settings/daemon/daemonSettings/useDaemonLogDialog.ts", phase: "P8" },
  { rule: "R1-value-api-rpc", file: "views/workspace/WorkspacePortsMenuControl.tsx", phase: "P4" },
  { rule: "R1-value-api-rpc", file: "views/workspace/LeftPane/useProjectListPersistence.ts", phase: "P4" },
  { rule: "R1-value-api-rpc", file: "views/workspace/LeftPane/useProjectListTreeData.ts", phase: "P4" },
  { rule: "R1-value-api-rpc", file: "views/workspace/RightPane/useWorkspacePullRequestState.ts", phase: "P4" },
  { rule: "R1-value-api-rpc", file: "views/workspace/useAgentChatSessionLifecycle.ts", phase: "P5" },
  { rule: "R1-value-api-rpc", file: "views/workspace/terminal/terminalSessionService.ts", phase: "P6" },
  { rule: "R1-value-api-rpc", file: "hooks/useDaemonConnectionMonitor.ts", phase: "P7" },
  { rule: "R1-value-api-rpc", file: "hooks/useOpenTabAutoRefresh.ts", phase: "P6" },
  { rule: "R1-value-api-rpc", file: "hooks/useRemoteHealthQuery.ts", phase: "P7" },
  { rule: "R1-value-api-rpc", file: "hooks/useShortcuts.ts", phase: "P6" },
  { rule: "R1-value-api-rpc", file: "components/AuthSessionExpiredSnackbar.tsx", phase: "P7" },
  { rule: "R1-value-api-rpc", file: "components/AppUpdateSnackbar.tsx", phase: "P7" },
  // ---- Rule 1: UI imports of main-process modules (cross-layer index §1b) ----
  { rule: "R1-main", file: "components/AppUpdateSnackbar.tsx", phase: "P7" },
  { rule: "R1-main", file: "hooks/useDaemonConnectionMonitor.ts", phase: "P7" },
  { rule: "R1-main", file: "views/settings/daemon/daemonSettings/DaemonConnectionSection.tsx", phase: "P8" },
  { rule: "R1-main", file: "views/settings/daemon/daemonSettings/DaemonRelaySection.tsx", phase: "P8" },
  { rule: "R1-main", file: "views/settings/daemon/daemonSettings/useDaemonConnectionState.ts", phase: "P8" },
  { rule: "R1-main", file: "views/settings/daemon/daemonSettings/useDaemonLogDialog.ts", phase: "P8" },
  { rule: "R1-main", file: "views/workspace/browser/BlankView.tsx", phase: "P5" },
  { rule: "R1-main", file: "views/workspace/browser/UrlBar.tsx", phase: "P5" },
  { rule: "R1-main", file: "views/workspace/browser/hooks/useBrowserHistory.ts", phase: "P5" },
  // ---- Rule 4: commands importing views/components (cross-layer index) ----
  { rule: "R4", file: "commands/projectCommands.ts", phase: "P4" },
];

const KNOWN_SET = new Set(KNOWN_VIOLATIONS.map((v) => `${v.rule}:${v.file}`));

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "public" || entry.name === "generated") continue;
      walkFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

type ImportRef = { spec: string; isTypeOnly: boolean };

function extractImports(path: string): ImportRef[] {
  const source = readFileSync(path, "utf8");
  const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind);
  const out: ImportRef[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const ic = node.importClause;
      const namedTypeOnly =
        ic?.namedBindings !== undefined &&
        ts.isNamedImports(ic.namedBindings) &&
        ic.namedBindings.elements.length > 0 &&
        ic.namedBindings.elements.every((el) => el.isTypeOnly);
      out.push({ spec: node.moduleSpecifier.text, isTypeOnly: Boolean(ic?.isTypeOnly || namedTypeOnly) });
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      out.push({ spec: node.moduleReference.expression.text, isTypeOnly: node.isTypeOnly });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (spec.startsWith("@renderer/")) return join(RENDERER_ROOT, spec.slice("@renderer/".length));
  if (spec.startsWith("@shared/")) return join(SHARED_ROOT, spec.slice("@shared/".length));
  if (spec.startsWith("@main/")) return join(MAIN_ROOT, spec.slice("@main/".length));
  if (spec.startsWith("./") || spec.startsWith("../")) return resolve(join(dirname(fromFile), spec));
  return null;
}

type Violation = { rule: RuleName; file: string; target: string };

function scanViolations(): { violations: Violation[]; sharedContracts: Violation[] } {
  const violations: Violation[] = [];
  const sharedContracts: Violation[] = [];
  const files = walkFiles(RENDERER_ROOT);

  for (const file of files) {
    const rel = relative(RENDERER_ROOT, file).replace(/\\/g, "/");
    if (rel === "architecture.test.ts") continue;
    const isUi = rel.startsWith("views/") || rel.startsWith("components/") || rel.startsWith("hooks/");
    const isPureDomain = rel.startsWith("store/tabs/") || rel.startsWith("store/split-pane/");

    for (const imp of extractImports(file)) {
      const target = resolveSpecifier(imp.spec, file);
      const relT = target ? relative(RENDERER_ROOT, target).replace(/\\/g, "/") : "";
      const relS = target ? relative(SHARED_ROOT, target).replace(/\\/g, "/") : "";
      const isTransport = relT.startsWith("api/") || relT.startsWith("rpc/");
      const isCommands = relT.startsWith("commands/");
      const isViews = relT.startsWith("views/") || relT.startsWith("components/");
      const isMain = relT.startsWith("../main/") || relT.startsWith("main/");

      if (isUi && !imp.isTypeOnly && isTransport) {
        violations.push({ rule: "R1-value-api-rpc", file: rel, target: imp.spec });
      }
      if (isUi && (imp.spec === "electron" || isMain)) {
        violations.push({ rule: "R1-main", file: rel, target: imp.spec });
      }
      if (isUi && relS.startsWith("contracts/")) {
        sharedContracts.push({ rule: "R1b-shared-contracts", file: rel, target: imp.spec });
      }
      if (rel.startsWith("store/") && !imp.isTypeOnly && (isTransport || isCommands || imp.spec === "electron")) {
        violations.push({ rule: "R2", file: rel, target: imp.spec });
      }
      if (
        isPureDomain &&
        (isTransport || isCommands || imp.spec === "electron" || imp.spec === "react" || imp.spec.startsWith("zustand"))
      ) {
        violations.push({ rule: "R3", file: rel, target: imp.spec });
      }
      if (rel.startsWith("commands/") && isViews) {
        violations.push({ rule: "R4", file: rel, target: imp.spec });
      }
    }
  }
  return { violations, sharedContracts };
}

describe("renderer architecture dependency rules", () => {
  it("enforces the Phase 1 rules against the baseline allowlist", () => {
    const { violations, sharedContracts } = scanViolations();

    // Report-only in Phase 1 (recorded for Phases 3/6/7).
    expect(sharedContracts.length).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log(`[archtest] R1b @shared/contracts DTO imports (deferred): ${sharedContracts.length} files`);

    const newViolations = violations.filter((v) => !KNOWN_SET.has(`${v.rule}:${v.file}`));
    const messages = newViolations.map(
      (v) =>
        `[archtest] NEW violation ${v.rule}: ${v.file} imports ${v.target} — fix it or add to KNOWN_VIOLATIONS with a phase tag`,
    );
    expect(messages, messages.join("\n")).toEqual([]);

    // Baseline overview: show what remains (informational).
    const byRule = new Map<string, number>();
    for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
    // eslint-disable-next-line no-console
    console.log(
      `[archtest] baseline violations still present: ${[...byRule.entries()]
        .map(([rule, n]) => `${rule}=${n}`)
        .join(", ")}`,
    );

    // Stale baseline entries (violation fixed, row not removed) are warnings only.
    const present = new Set(violations.map((v) => `${v.rule}:${v.file}`));
    const stale = [...KNOWN_VIOLATIONS].filter((v) => !present.has(`${v.rule}:${v.file}`));
    if (stale.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[archtest] stale KNOWN_VIOLATIONS (fix complete, remove from list): ${stale
          .map((v) => `${v.rule}:${v.file}`)
          .join(", ")}`,
      );
    }
  });
});
