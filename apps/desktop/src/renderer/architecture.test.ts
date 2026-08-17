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
 *   - Rule 3 (pure domain → framework): features/workbench/model/tabs/ and features/workbench/model/split-pane/ must
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

type RuleName =
  | "R1-value-api-rpc"
  | "R1-main"
  | "R1b-shared-contracts"
  | "R2"
  | "R3"
  | "R4"
  | "R5-cross-feature-internal";
type KnownViolation = { rule: RuleName; file: string; phase: string };

/**
 * Phase 0 baseline. Remove rows as later phases fix them.
 * Phase tags come from the cross-layer-dependency-index.
 */
const KNOWN_VIOLATIONS: KnownViolation[] = [
  // ---- Rule 1: UI value-imports of api/rpc (cross-layer index §1) ----
  // ---- Rule 1: dir-spec api/rpc imports ("from \"../../api\"", no trailing slash) — Phase 4 gap closure ----
  // ---- Rule 1: UI imports of main-process modules (cross-layer index §1b) ----
  // ---- Rule 4: commands importing views/components (cross-layer index) ----
  // ---- Phase 14 baseline: view moves exposed pre-existing cross-feature
  // Store/transport imports (views/<f> -> features/<f>/ui). Replace with
  // feature Selectors/Commands per Phase 14 task 8; remove rows as fixed. ----
  { rule: "R5-cross-feature-internal", file: "features/overview/ui/OverviewView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/CreateScheduledJobFormView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/EditScheduledJobDialogView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/ScheduledJobDetailFields.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/ScheduledJobDetailView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/scheduled-job/ui/ScheduledJobListItemView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/AccountSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/GitWorkspaceSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/LanguageSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/LinkSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/MarkdownSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/MemberSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/NodesSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/TerminalSettingsView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/settings/ui/daemon/daemonSettings/closeTerminalTabsForDaemonRestart.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalRuntimeRegistry.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/AgentChatComposerPane.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/AgentChatTranscriptPane.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/AgentChatView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/ChatView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/DaemonVersionWarningControl.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/FileSearchOverlay.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/CreateWorkspaceDialogView.testUtils.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/CreateWorkspaceDialogView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/LeftPaneResourceUsageControl.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/LeftPaneView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/ProjectConfigDialogView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/ProjectFilterPopoverView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/ProjectListView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/useCreateWorkspaceDialogState.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/useProjectListDialogState.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/useProjectListFoldState.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/LeftPane/useProjectListTreeData.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/MainPaneTitleBarView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/MainPaneView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/OnboardingView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/RightPane/RightPaneTabBar.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/RightPane/RightPaneView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/RightPane/useChangesTabState.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/WorkspacePortsMenuControl.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/WorkspaceResourceUsageControl.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/WorkspaceSplitPaneView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/browser/BrowserView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/terminal/TerminalView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/terminal/useTerminalFileDrop.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/terminal/useTerminalWakeRecovery.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/useAgentChatSessionLifecycle.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/useAgentChatSubagentActions.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/ui/usePaneTabHandlers.ts", phase: "P14" },
  // ---- Rule 5 baseline (Phase 14): pre-existing cross-feature Store imports
  // (store/ root moved to features/<feature>/state). Replace with feature
  // Selectors/Commands per Phase 14 task 8; remove rows as fixed. ----
  { rule: "R5-cross-feature-internal", file: "features/agent/commands/agentChatCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/agent/commands/agentChatSubagentCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/agent/commands/piProviderCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/agent/events/agentChatSubagentEvents.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/agent/runtime/agentChatRecovery.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/agent/runtime/agentSessionRuntime.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/files/ui/FileManagerView.tsx", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/files/ui/useFileTreeOperations.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/git/commands/gitCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/notification/events/notificationEventHandlers.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/organization/commands/orgCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/project/commands/projectCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/events/terminalEventHandlers.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/events/terminalSessionTabReconciler.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalRecovery.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalSessionOrchestrator.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalSessionService.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/terminal/runtime/terminalTitleUtils.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workbench/commands/tabCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workbench/commands/workspaceTabSync.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workbench/state/tabStore.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/commands/localFolderCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/commands/selectionCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/commands/workspaceCommands.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/commands/workspaceCreateCommand.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/events/workspaceEventHandlers.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/state/workspace/actions.localFolders.ts", phase: "P14" },
  { rule: "R5-cross-feature-internal", file: "features/workspace/state/workspace/actions.selection.ts", phase: "P14" },
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
    const isUi =
      rel.startsWith("views/") ||
      rel.startsWith("components/") ||
      rel.startsWith("hooks/") ||
      rel.startsWith("app/routes/") ||
      rel.startsWith("ui/") ||
      (/^features\/[^/]+\/ui\//.test(rel));
    const isPureDomain = rel.startsWith("features/workbench/model/tabs/") || rel.startsWith("features/workbench/model/split-pane/");

    for (const imp of extractImports(file)) {
      const target = resolveSpecifier(imp.spec, file);
      const relT = target ? relative(RENDERER_ROOT, target).replace(/\\/g, "/") : "";
      const relS = target ? relative(SHARED_ROOT, target).replace(/\\/g, "/") : "";
      // Dir-spec imports ("from \"../../api\"") resolve to the dir without a trailing
      // slash; treat the bare dir as transport too (Phase 4 gap closure).
      const isTransport = relT.startsWith("api/") || relT.startsWith("rpc/") || relT === "api" || relT === "rpc";
      const isCommands = relT.startsWith("commands/");
      const isViews =
        relT.startsWith("views/") ||
        relT.startsWith("components/") ||
        relT.startsWith("ui/") ||
        /^features\/[^/]+\/ui\//.test(relT);
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
      if ((rel.startsWith("commands/") || /^features\/[^/]+\/commands\//.test(rel)) && isViews) {
        violations.push({ rule: "R4", file: rel, target: imp.spec });
      }
      // ---- Rule 5: feature A must not import feature B's internal State,
      // Runtime, or Event Handler (Phase 12, desktop5.md). Cross-feature
      // imports are allowed only to another feature's public surface: its
      // commands/ modules (the declared command surface) or its index.ts.
      const crossFeature = /^features\/([^/]+)\//.exec(rel);
      const crossTarget = /^features\/([^/]+)\//.exec(relT);
      if (crossFeature && crossTarget && crossFeature[1] !== crossTarget[1]) {
        // The owning feature's public state surface (Selectors = read models,
        // Actions = state-change surface) is importable; the Store itself is not.
        const isPublicStateSurface = /\/state\/[^/]+(Selectors|Actions)(\.ts)?$/.test(relT);
        const targetInternal =
          !isPublicStateSurface &&
          (relT.includes("/state/") ||
            relT.includes("/events/") ||
            relT.includes("/runtime/") ||
            /\/model\/[^/]*Store(\.ts)?$/.test(relT));
        if (targetInternal) {
          violations.push({ rule: "R5-cross-feature-internal", file: rel, target: imp.spec });
        }
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
