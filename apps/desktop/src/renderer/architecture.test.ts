// @vitest-environment node

/**
 * Architecture test — Desktop renderer dependency rules (Phases 1–20).
 *
 * Phase 16 restructured this file into one focused test group per stable rule
 * and hardened the allowlist lifecycle. Phase D2 (Domains plan) re-owned the
 * terminology and the allowlist mechanism:
 *
 *   - each rule has its own `describe` with a focused assertion;
 *   - a NEW boundary violation fails the test with file + import target;
 *   - a STALE allowlist row (violation already fixed) fails the test;
 *   - an allowlist row tagged with a completed phase fails the test;
 *   - allowlist rows carry the Domain phase that owns their removal
 *     (`D3`-`D17`); the single `CURRENT_PHASE` tag was replaced by
 *     `COMPLETED_PHASES`, and rows tagged with a completed phase are rejected;
 *   - normal Zustand imports from Domain State files are permitted (no false
 *     positive), and State may import the owning Domain's Model.
 *
 * Rule set (desktop.md … desktop6.md, desktop-domains-refactor-plan.md):
 *
 *   - R1  UI (components/, ui/, Domain ui, app/routes/) must not VALUE-import
 *         renderer/api/* or renderer/rpc/*, `electron`, or main-process code.
 *   - R1b @shared/contracts DTO imports from UI: report-only (deferred).
 *   - R3  domains/workbench/model/tabs|split-pane must not import react,
 *         zustand, transport, commands, or electron.
 *   - R4  Commands must not import Views or Components.
 *   - R5  Domain code must not import another Domain's internal State,
 *         Events, Runtime, or Store Model; only public surfaces (Commands,
 *         Selectors, Actions, index, Model types).
 *   - R6  State files own Zustand State, Selectors, and synchronous mutations;
 *         they may import Zustand and their own Domain's Model/State, but not
 *         transport, Electron, Commands, Runtime, or another Domain's State.
 *   - R7  Model files must not import React, Zustand, Electron, transport,
 *         Runtime, or State. desktop8 Phase 29 additionally rejects the owning
 *         Domain's UI/Features/Hooks/Commands/Events/Runtime/Infrastructure,
 *         UI libraries (react-icons/@mui/monaco/design tokens), and root
 *         ui/hooks/api/rpc/platform/events implementations.
 *   - R8  Infrastructure (api/, rpc/) must not import Domain UI, app routes,
 *         or shared ui.
 *   - R9  Shared ui/ and components/ must not import Domain or app code.
 *   - R14 Cross-Domain code must import another Domain only through its public
 *         index.ts (or the Domain root); deep imports into another Domain's
 *         internals are violations.
 *   - R15 Domain code must not import `app`.
 *   - R16 App code must not deep-import a Domain (only the public index.ts).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { COMPLETED_PHASES, KNOWN_VIOLATIONS, type KnownViolation, type RuleName } from "./architecture.knownViolations";
import {
  ROOT_HELPERS_FILES,
  ROOT_HELPERS_IMPORTERS,
  ROOT_UI_DEP_VIOLATION_FILES,
  ROOT_UI_HOOKS_FILES,
} from "./architecture.migrationBaselines";

const RENDERER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const SHARED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../shared");
const MAIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../main");

const KNOWN_SET = new Set(KNOWN_VIOLATIONS.map((v) => `${v.rule}:${v.file}`));

/**
 * Recorded Phase 16 baseline counts (occurrences, not files). A phase must not
 * increase a count; update an entry only when a phase intentionally fixes
 * violations and its pull request records the new number. Phase D2 added the
 * R14/R15/R16 baseline counts from the Domains plan (production code only;
 * the walk excludes test files).
 */
const BASELINE_COUNTS: Record<RuleName, number> = {
  "R1-value-api-rpc": 0,
  "R1-main": 0,
  "R1b-shared-contracts": 0,
  R3: 0,
  R4: 0,
  "R5-cross-feature-internal": 0,
  "R6-state-layer": 0,
  "R7-model-layer": 0,
  "R8-infra-layer": 0,
  "R9-ui-components": 0,
  "R10-workspace-workbench": 0,
  "R11-workbench-product-import": 0,
  "R12-store-action-promise": 0,
  "R13-getter-forwarding-action-file": 0,
  "R14-cross-domain-deep": 0,
  "R15-app-from-domain": 0,
  "R16-app-deep-into-domain": 0,
  "R17-domain-self-index": 0,
  "R18-wildcard-domain-index": 0,
  "R19-rpc-whitelist": 0,
  "R20-layer-transport": 0,
  "R21-events-app-domain": 0,
  "R22-shared-renderer-import": 0,
  "R23-removed-root-capabilities": 0,
  "R24-platform-app-domain": 0,
  "R25-forbidden-domain-bucket": 0,
  "R26-technical-nested-index": 0,
};

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "public" || entry.name === "generated") continue;
      walkFiles(path, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|testUtils)\./.test(entry.name)) {
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

function scanViolations(): Violation[] {
  const violations: Violation[] = [];
  const files = [...walkFiles(RENDERER_ROOT), ...walkFiles(SHARED_ROOT)];

  for (const file of files) {
    const rel = relative(RENDERER_ROOT, file).replace(/\\/g, "/");
    if (rel.startsWith("architecture.")) continue;
    const isUi =
      rel.startsWith("components/") ||
      rel.startsWith("ui/") ||
      rel.startsWith("app/routes/") ||
      /^domains\/[^/]+\/ui\//.test(rel) ||
      /^domains\/[^/]+\/features\//.test(rel) ||
      /^domains\/[^/]+\/hooks\//.test(rel);
    const isPureDomain =
      rel.startsWith("domains/workbench/model/tabs/") || rel.startsWith("domains/workbench/model/split-pane/");

    for (const imp of extractImports(file)) {
      const target = resolveSpecifier(imp.spec, file);
      const relT = target ? relative(RENDERER_ROOT, target).replace(/\\/g, "/") : "";
      const relS = target ? relative(SHARED_ROOT, target).replace(/\\/g, "/") : "";
      // Dir-spec imports ("from \"../../api\"") resolve to the dir without a trailing
      // slash; treat the bare dir as transport too (Phase 4 gap closure).
      const isTransport = relT.startsWith("api/") || relT.startsWith("rpc/") || relT === "api" || relT === "rpc";
      const isCommands = relT.startsWith("commands/");
      const isViews = relT.startsWith("components/") || relT.startsWith("ui/") || /^domains\/[^/]+\/ui\//.test(relT);
      const isMain = relT.startsWith("../main/") || relT.startsWith("main/");

      // ---- Rule 1: UI value-imports of transport or main-process code. ----
      if (isUi && !imp.isTypeOnly && isTransport) {
        violations.push({ rule: "R1-value-api-rpc", file: rel, target: imp.spec });
      }
      if (isUi && (imp.spec === "electron" || isMain)) {
        violations.push({ rule: "R1-main", file: rel, target: imp.spec });
      }
      // ---- Rule 1b: @shared/contracts DTO imports from UI (report-only). ----
      if (isUi && relS.startsWith("contracts/")) {
        violations.push({ rule: "R1b-shared-contracts", file: rel, target: imp.spec });
      }
      // ---- Rule 3: pure Workbench domain (tabs, split-pane) stays framework-free. ----
      if (
        isPureDomain &&
        (isTransport || isCommands || imp.spec === "electron" || imp.spec === "react" || imp.spec.startsWith("zustand"))
      ) {
        violations.push({ rule: "R3", file: rel, target: imp.spec });
      }
      // ---- Rule 4: Commands must not import Views or Components. ----
      if ((rel.startsWith("commands/") || /^domains\/[^/]+\/commands\//.test(rel)) && isViews) {
        violations.push({ rule: "R4", file: rel, target: imp.spec });
      }
      // ---- Rule 5: Domain A must not import Domain B's internal State,
      // Runtime, Event Handler, or Store Model. Cross-feature imports are
      // allowed only to another feature's public surface: Commands, State
      // Selectors/Actions, Model types, or its index.ts (Phase 12, desktop5.md). ----
      const crossFeature = /^domains\/([^/]+)\//.exec(rel);
      const crossTarget = /^domains\/([^/]+)\//.exec(relT);
      // ---- Rule 6: State files own Zustand State, Selectors, and synchronous
      // mutations. They may import Zustand and the owning Domain's Model and
      // State. They must not import transport implementations, Electron,
      // Commands, Runtime implementations (own or other Domain), or another
      // Domain's State internals. Selectors/Actions files are the public State
      // surface and are excluded. (Phase 15, corrected in Phase 16) ----
      if (/^domains\/[^/]+\/state\//.test(rel) && !rel.includes(".test.")) {
        const isOwnFeature = crossTarget && crossFeature && crossTarget[1] === crossFeature[1];
        const isPublicStateSurface = /\/state\/[^/]+(Selectors|Actions)(\.ts)?$/.test(relT);
        if (!isPublicStateSurface && (isTransport || imp.spec === "electron")) {
          violations.push({ rule: "R6-state-layer", file: rel, target: imp.spec });
        }
        if (!isPublicStateSurface && relT.includes("/commands/")) {
          violations.push({ rule: "R6-state-layer", file: rel, target: imp.spec });
        }
        if (!isPublicStateSurface && relT.includes("/runtime/")) {
          violations.push({ rule: "R6-state-layer", file: rel, target: imp.spec });
        }
        if (!isOwnFeature && !isPublicStateSurface && relT.includes("/state/")) {
          violations.push({ rule: "R6-state-layer", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 7: Model files are pure data and rules. They must not import
      // React, Zustand, Electron, transport, Runtime, or State (Phase 15).
      // desktop8 Phase 29: also reject the owning Domain's UI/Features/Hooks/
      // Commands/Events/Runtime/Infrastructure, UI libraries and presentation
      // modules (react-icons, @mui, monaco, design tokens), and root
      // ui/hooks/api/rpc/platform/events implementations. ----
      if (/^domains\/[^/]+\/model\//.test(rel) && !rel.includes(".test.")) {
        const ownDomain = /^domains\/([^/]+)\//.exec(rel)?.[1] ?? "";
        if (
          imp.spec === "react" ||
          imp.spec === "zustand" ||
          imp.spec === "electron" ||
          isTransport ||
          relT.includes("/runtime/") ||
          relT.includes("/state/") ||
          relT.startsWith(`domains/${ownDomain}/ui/`) ||
          relT.startsWith(`domains/${ownDomain}/features/`) ||
          relT.startsWith(`domains/${ownDomain}/hooks/`) ||
          relT.startsWith(`domains/${ownDomain}/commands/`) ||
          relT.startsWith(`domains/${ownDomain}/subscriptions/`) ||
          relT.startsWith(`domains/${ownDomain}/infrastructure/`) ||
          relT.startsWith(`domains/${ownDomain}/daemon/`) ||
          relT.startsWith(`domains/${ownDomain}/api/`) ||
          relT.startsWith(`domains/${ownDomain}/host/`) ||
          relT.startsWith(`domains/${ownDomain}/persistence/`) ||
          imp.spec === "react-icons" ||
          imp.spec.startsWith("react-icons/") ||
          imp.spec.startsWith("@mui/") ||
          imp.spec === "monaco-editor" ||
          imp.spec.startsWith("monaco-editor/") ||
          imp.spec.startsWith("@yishan-io/design-tokens") ||
          relT === "ui" ||
          relT.startsWith("ui/") ||
          relT === "hooks" ||
          relT.startsWith("hooks/") ||
          relT === "api" ||
          relT.startsWith("api/") ||
          relT === "rpc" ||
          relT.startsWith("rpc/") ||
          relT === "platform" ||
          relT.startsWith("platform/") ||
          relT === "events" ||
          relT.startsWith("events/")
        ) {
          violations.push({ rule: "R7-model-layer", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 8: Infrastructure (api/, rpc/) must not import Domain UI,
      // app routes, or shared ui. ----
      if ((rel.startsWith("api/") || rel.startsWith("rpc/")) && !rel.includes(".test.")) {
        if (/^domains\/[^/]+\/ui\//.test(relT) || relT.startsWith("app/routes/") || relT.startsWith("ui/")) {
          violations.push({ rule: "R8-infra-layer", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 9: Domain-free shared ui/components must not import Domain
      // internals or application code. ----
      if ((rel.startsWith("ui/") || rel.startsWith("components/")) && !rel.includes(".test.")) {
        if (/^domains\//.test(relT) || relT.startsWith("app/")) {
          violations.push({ rule: "R9-ui-components", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 10 (desktop6-adjust.md W1): Workspace Model and State must
      // not import Workbench, and Workbench Model must not import Workspace
      // State (Workspace Store types under Workbench Model are an ownership
      // inversion). Workspace Commands and UI may use the Workbench public API. ----
      if (/^domains\/workspace\/(model|state)\//.test(rel) && relT.startsWith("domains/workbench/")) {
        violations.push({ rule: "R10-workspace-workbench", file: rel, target: imp.spec });
      }
      if (/^domains\/workbench\/model\//.test(rel) && relT.startsWith("domains/workspace/")) {
        violations.push({ rule: "R10-workspace-workbench", file: rel, target: imp.spec });
      }
      // ---- Rule 11 (desktop6-adjust.md W8): Workbench must not import
      // product modules at all (not just Model). Workbench is a shared
      // Desktop presentation capability; product modules must call its public
      // Commands instead. Value imports from another feature (through any
      // path, including the module root API) are a boundary violation.
      // Type-only imports of stable model types are allowed (a Workbench Tab
      // model legitimately references agent kind types). ----
      if (
        !imp.isTypeOnly &&
        rel.startsWith("domains/workbench/") &&
        /^domains\/[^/]+/.test(relT) &&
        relT !== "domains/workbench" &&
        !relT.startsWith("domains/workbench/")
      ) {
        violations.push({ rule: "R11-workbench-product-import", file: rel, target: imp.spec });
      }
      // ---- Rule 5 (cont.): the owning Domain's public State surface
      // (Selectors = read models, Actions = state-change surface) is
      // importable; the Store itself and other internals are not. ----
      if (crossFeature && crossTarget && crossFeature[1] !== crossTarget[1]) {
        const isPublicStateSurface = /\/state\/[^/]+(Selectors|Actions)(\.ts)?$/.test(relT);
        const targetInternal =
          !isPublicStateSurface &&
          (relT.includes("/state/") ||
            relT.includes("/subscriptions/") ||
            relT.includes("/runtime/") ||
            /\/model\/[^/]*Store(\.ts)?$/.test(relT));
        if (targetInternal) {
          violations.push({ rule: "R5-cross-feature-internal", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 14 (desktop-domains-refactor-plan.md D2): cross-Domain code
      // imports another Domain only through its public index.ts (or the Domain
      // root). A deep import into another Domain's internals is a violation.
      // Domain code may use its own relative imports. ----
      if (/^domains\/([^/]+)\//.test(rel) && /^domains\/([^/]+)\//.test(relT)) {
        const srcDomain = /^domains\/([^/]+)\//.exec(rel)?.[1];
        const tgtDomain = /^domains\/([^/]+)\//.exec(relT)?.[1];
        if (srcDomain !== tgtDomain) {
          const rest = relT.replace(/^domains\/[^/]+\/?/, "");
          if (rest !== "" && rest !== "index.ts") {
            violations.push({ rule: "R14-cross-domain-deep", file: rel, target: imp.spec });
          }
        }
      }
      // ---- Rule 15 (desktop-domains-refactor-plan.md D2): Domain code must
      // not import `app`. App owns composition; Domains must not depend on it. ----
      if (/^domains\//.test(rel) && relT.startsWith("app/")) {
        violations.push({ rule: "R15-app-from-domain", file: rel, target: imp.spec });
      }
      // ---- Rule 16 (desktop-domains-refactor-plan.md D2): App code must not
      // deep-import a Domain. App uses each Domain through its public index.ts
      // (or the Domain root). ----
      if (rel.startsWith("app/") && /^domains\/([^/]+)\//.test(relT)) {
        const rest = relT.replace(/^domains\/[^/]+\/?/, "");
        if (rest !== "" && rest !== "index.ts") {
          violations.push({ rule: "R16-app-deep-into-domain", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 17 (desktop7 Phase 27): a Domain must not VALUE-import its
      // own root index. Type-only imports are erased at runtime (no eval
      // cycle) and carry cross-domain contract re-exports, so they stay
      // allowed (mirrors the R11 type-only exception). ----
      const selfDomainMatch = rel.match(/^domains\/([^/]+)\//);
      if (!imp.isTypeOnly && selfDomainMatch) {
        const ownIndex = relT === `domains/${selfDomainMatch[1]}` || relT === `domains/${selfDomainMatch[1]}/index`;
        if (ownIndex) {
          violations.push({ rule: "R17-domain-self-index", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 19 (desktop7 Phase 27; desktop8 Phase 31): root RPC is
      // imported only by app/events, app/runtime, Domain boundary
      // directories (infrastructure/, daemon/, api/, host/, persistence/),
      // and the root events capability (which owns backend-event
      // composition). Consumers must use the RPC public API (rpc/index);
      // importing RPC implementation files is a violation. Root RPC's own
      // wiring is exempt. ----
      const isRpcImport = relT.startsWith("rpc/") || relT === "rpc";
      if (isRpcImport && !rel.startsWith("rpc/")) {
        const whitelisted =
          rel.startsWith("app/events/") ||
          rel.startsWith("app/runtime/") ||
          rel.startsWith("events/") ||
          rel.includes("/infrastructure/") ||
          /^domains\/[^/]+\/(daemon|api|host|persistence)\//.test(rel);
        const publicApiOnly = relT === "rpc" || relT.startsWith("rpc/index");
        if (!whitelisted || !publicApiOnly) {
          violations.push({ rule: "R19-rpc-whitelist", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 20 (desktop7 Phase 27): Model, State, Hooks, UI, and
      // Features must not import root transport. ----
      if (isTransport && /^domains\/[^/]+\/(model|state|hooks|ui|features)\//.test(rel)) {
        violations.push({ rule: "R20-layer-transport", file: rel, target: imp.spec });
      }
      // ---- Rule 21 (desktop8 Phase 32): root events capability must not
      // import App or Domains. App composes events; Domains consume the
      // root events facade. ----
      if (rel.startsWith("events/") && (relT.startsWith("app/") || relT.startsWith("domains/"))) {
        violations.push({ rule: "R21-events-app-domain", file: rel, target: imp.spec });
      }
      // ---- Rule 22 (desktop8 Phase 32): src/shared technical modules must
      // not import Renderer, Main, or product Domains. Shared capabilities
      // are business-neutral and process-agnostic; external packages stay
      // allowed (unresolved specifiers resolve to an empty relT). ----
      if (rel.startsWith("../shared/") && relT !== "" && !relT.startsWith("../shared/")) {
        violations.push({ rule: "R22-shared-renderer-import", file: rel, target: imp.spec });
      }
      // ---- Rule 23 (desktop8 Phase 32): the root async/ids/path/version
      // capabilities moved to src/shared; the root directories must not
      // return. ----
      if (/^async\//.test(relT) || /^ids\//.test(relT) || /^path\//.test(relT) || /^version\//.test(relT)) {
        violations.push({ rule: "R23-removed-root-capabilities", file: rel, target: imp.spec });
      }
      // ---- Rule 24 (desktop8 Phase 32): root platform capability must not
      // import App or Domains (host bridge + platform detection only). ----
      if (rel.startsWith("platform/") && (relT.startsWith("app/") || relT.startsWith("domains/"))) {
        violations.push({ rule: "R24-platform-app-domain", file: rel, target: imp.spec });
      }
    }
    // ---- Rule 25 (desktop9 Phase 39): generic Domain buckets are rejected.
    // Ownership determines location; model/services/rules/infrastructure are
    // file-type buckets that must not return. ----
    if (/^domains\/[^/]+\/(model|services|rules|infrastructure)\//.test(rel) && !rel.includes(".test.")) {
      violations.push({ rule: "R25-forbidden-domain-bucket", file: rel, target: "generic bucket" });
    }
    // ---- Rule 26 (desktop9 Phase 39): a nested index.ts is an internal-module
    // API. It is allowed only under features/<use-case>/ or a named business
    // module directory, never under technical directories. ----
    if (/^domains\/[^/]+\/(state|commands|hooks|ui|daemon|api|host|subscriptions|runtime)\/(?:[^/]+\/)*index\.ts$/.test(rel)) {
      violations.push({ rule: "R26-technical-nested-index", file: rel, target: "technical nested index" });
    }
    // ---- Rule 12 (desktop6-adjust.md W8): Store Actions must stay
    // synchronous. A Store Action changes one owning Store synchronously; it
    // must not return a Promise. Scan Store State files for async method
    // definitions or Promise-returning action signatures. ----
    if (/^domains\/[^/]+\/state\//.test(rel) && !rel.includes(".test.")) {
      const source = readFileSync(file, "utf8");
      const scriptKind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
      const isStoreDef = /create<|create\(/.test(source) && !/Selectors(\.ts)?$/.test(rel);
      if (isStoreDef) {
        const visitAction = (node: ts.Node) => {
          if (
            (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) &&
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
          ) {
            violations.push({ rule: "R12-store-action-promise", file: rel, target: "async store action" });
          }
          if (ts.isPropertySignature(node) || ts.isPropertyAssignment(node)) {
            const typeText = ts.isPropertySignature(node) && node.type ? node.type.getText(sf) : "";
            const initText = ts.isPropertyAssignment(node) && node.initializer ? node.initializer.getText(sf) : "";
            if (/^Promise<|=> Promise<|: Promise</.test(typeText) || /=> Promise</.test(initText)) {
              violations.push({ rule: "R12-store-action-promise", file: rel, target: "Promise-typed action" });
            }
          }
          ts.forEachChild(node, visitAction);
        };
        visitAction(sf);
      }
    }
    // ---- Rule 13 (desktop6-adjust.md W8): no new Getter layers. A Getter
    // that only wraps store.getState() is banned (W6 removed workbenchGetters;
    // this rule prevents new ones). The public Selectors/Actions State surface
    // is allowed (Rule 5), so only *Getters* file names are rejected. ----
    if (/^domains\/[^/]+\/state\//.test(rel) && !rel.includes(".test.")) {
      const baseName = rel.split("/").pop() ?? "";
      if (/(?:Getter|Getters)\.ts$/.test(baseName)) {
        violations.push({ rule: "R13-getter-forwarding-action-file", file: rel, target: baseName });
      }
    }
  }
  return violations;
}

function unbaselined(violations: Violation[], rule: RuleName): Violation[] {
  return violations.filter((v) => v.rule === rule && !KNOWN_SET.has(`${v.rule}:${v.file}`));
}

function failureMessages(fresh: Violation[]): string[] {
  return fresh.map(
    (v) =>
      `[archtest] NEW violation ${v.rule}: ${v.file} imports ${v.target} — fix it or add to KNOWN_VIOLATIONS with its owning Domain phase`,
  );
}

describe("renderer architecture dependency rules", () => {
  let violations: Violation[];

  beforeAll(() => {
    violations = scanViolations();
  });

  describe("R1: UI must not import transport implementations or main-process code", () => {
    it("reports no unbaselined value imports of api/rpc/electron/main from UI code", () => {
      const fresh = [...unbaselined(violations, "R1-value-api-rpc"), ...unbaselined(violations, "R1-main")];
      const messages = failureMessages(fresh);
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R17: Domain must not VALUE-import its own root index (desktop7 Phase 27)", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R17-domain-self-index"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R18: Domain root indexes use explicit named exports only (desktop7 Phase 27)", () => {
    it("rejects wildcard exports", () => {
      const wildcardFiles = walkFiles(join(RENDERER_ROOT, "domains"))
        .filter((file) => /\/index\.ts$/.test(file))
        .filter((file) => /\bexport\s+\*\s+from/.test(readFileSync(file, "utf8")));
      const messages = wildcardFiles.map(
        (p) => `[archtest] wildcard export in domain index ${relative(RENDERER_ROOT, p)} — use explicit named exports`,
      );
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R19: root RPC imports come from app/events, app/runtime, or Domain Infrastructure (desktop7 Phase 27)", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R19-rpc-whitelist"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R20: Model, State, Hooks, UI, and Features do not import root transport (desktop7 Phase 27)", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R20-layer-transport"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R21: root events must not import App or Domains (desktop8 Phase 32)", () => {
    it("reports no violations", () => {
      const messages = failureMessages(unbaselined(violations, "R21-events-app-domain"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R22: src/shared technical modules must not import Renderer, Main, or Domains (desktop8 Phase 32)", () => {
    it("reports no violations", () => {
      const messages = failureMessages(unbaselined(violations, "R22-shared-renderer-import"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R23: removed root async/ids/path/version capabilities must not return (desktop8 Phase 32)", () => {
    it("rejects imports of the removed root capability paths", () => {
      const messages = failureMessages(unbaselined(violations, "R23-removed-root-capabilities"));
      expect(messages, messages.join("\n")).toEqual([]);
    });

    it("keeps the root capability directories deleted", () => {
      for (const capability of ["async", "ids", "path", "version"]) {
        expect(existsSync(join(RENDERER_ROOT, capability)), `root ${capability}/ must not return`).toBe(false);
      }
    });
  });

  describe("R24: root platform must not import App or Domains (desktop8 Phase 32)", () => {
    it("reports no violations", () => {
      const messages = failureMessages(unbaselined(violations, "R24-platform-app-domain"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R1b: @shared/contracts DTO imports from UI (desktop7 Phase 27, enforced)", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R1b-shared-contracts"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R3: pure Workbench domain stays framework-free", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R3"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R4: Commands must not import Views or Components", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R4"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R5: Domains import other Domains through public surfaces only", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R5-cross-feature-internal"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R6: State layer owns State, Selectors, and synchronous mutations", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R6-state-layer"));
      expect(messages, messages.join("\n")).toEqual([]);
    });

    it("permits normal Zustand imports from Domain State files (no false positive)", () => {
      const zustandFlags = violations.filter((v) => v.rule === "R6-state-layer" && v.target === "zustand");
      expect(zustandFlags, "State files use Zustand to define their stores").toEqual([]);
    });

    it("permits State imports of the owning Domain's Model", () => {
      const modelFlags = violations.filter((v) => v.rule === "R6-state-layer" && v.target.includes("/model/"));
      expect(modelFlags, "State files may read their owning Domain's Model types").toEqual([]);
    });
  });

  describe("R7: Model layer stays pure data and rules", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R7-model-layer"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R8: Infrastructure must not import Domain UI, app routes, or shared ui", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R8-infra-layer"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R9: Shared UI must not import Domain or app code", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R9-ui-components"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R10: Workspace Model/State must not import Workbench (desktop6-adjust W1)", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R10-workspace-workbench"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R11: Workbench must not import product modules (desktop6-adjust W8)", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R11-workbench-product-import"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R12: Store Actions must stay synchronous (desktop6-adjust W8)", () => {
    it("reports no async or Promise-returning Store Actions", () => {
      const messages = failureMessages(unbaselined(violations, "R12-store-action-promise"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R13: no Getter layers in Domain State (desktop6-adjust W8)", () => {
    it("reports no new Getter files", () => {
      const messages = failureMessages(unbaselined(violations, "R13-getter-forwarding-action-file"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R14: cross-Domain imports go through the public index.ts (Domains D2)", () => {
    it("reports no unbaselined deep imports into another Domain", () => {
      const messages = failureMessages(unbaselined(violations, "R14-cross-domain-deep"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R15: Domain code must not import app (Domains D2)", () => {
    it("reports no unbaselined app imports from Domain code", () => {
      const messages = failureMessages(unbaselined(violations, "R15-app-from-domain"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R16: App must not deep-import a Domain (Domains D2)", () => {
    it("reports no unbaselined deep imports into a Domain", () => {
      const messages = failureMessages(unbaselined(violations, "R16-app-deep-into-domain"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("Allowlist lifecycle", () => {
    it("fails on stale allowlist rows (violation already fixed)", () => {
      const present = new Set(violations.map((v) => `${v.rule}:${v.file}`));
      const stale = KNOWN_VIOLATIONS.filter((v) => !present.has(`${v.rule}:${v.file}`));
      const messages = stale.map(
        (v) => `[archtest] STALE allowlist row ${v.rule}: ${v.file} — violation fixed, remove the row`,
      );
      expect(messages, messages.join("\n")).toEqual([]);
    });

    it("rejects allowlist rows tagged with a completed phase", () => {
      const badPhase = KNOWN_VIOLATIONS.filter((v: KnownViolation) =>
        (COMPLETED_PHASES as readonly string[]).includes(v.phase),
      );
      const messages = badPhase.map(
        (v) => `[archtest] allowlist row ${v.rule}: ${v.file} tagged ${v.phase} — completed phase, remove the row`,
      );
      expect(messages, messages.join("\n")).toEqual([]);
    });

    it("keeps baseline violation counts stable", () => {
      const byRule = new Map<RuleName, number>();
      for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
      // eslint-disable-next-line no-console
      console.log(
        `[archtest] baseline violations: ${[...byRule.entries()].map(([rule, n]) => `${rule}=${n}`).join(", ")}`,
      );
      const mismatches: string[] = [];
      // R1b is report-only and asserted in its own group; it is not part of `violations`.
      for (const rule of (Object.keys(BASELINE_COUNTS) as RuleName[]).filter((r) => r !== "R1b-shared-contracts")) {
        const actual = byRule.get(rule) ?? 0;
        if (actual !== BASELINE_COUNTS[rule]) {
          mismatches.push(
            `[archtest] baseline mismatch ${rule}: ${actual} != ${BASELINE_COUNTS[rule]} — update BASELINE_COUNTS only when a phase intentionally fixes violations`,
          );
        }
      }
      expect(mismatches, mismatches.join("\n")).toEqual([]);
    });
  });

  describe("Migration baselines (desktop7 Phase 21)", () => {
    const helperBaseline = new Set(ROOT_HELPERS_FILES.map((p) => resolve(RENDERER_ROOT, p)));
    const helperImporterBaseline = new Set(ROOT_HELPERS_IMPORTERS.map((p) => resolve(RENDERER_ROOT, p)));
    const uiHooksBaseline = new Set(ROOT_UI_HOOKS_FILES.map((p) => resolve(RENDERER_ROOT, p)));
    const uiDepViolationBaseline = new Set(ROOT_UI_DEP_VIOLATION_FILES.map((p) => resolve(RENDERER_ROOT, p)));

    it("rejects new root Helpers files outside the recorded baseline", () => {
      const present = new Set(walkFiles(join(RENDERER_ROOT, "helpers")));
      const newFiles = [...present].filter((p) => !helperBaseline.has(p));
      const messages = newFiles.map(
        (p) => `[archtest] NEW root Helpers file ${relative(RENDERER_ROOT, p)} — Phase 21 baseline must not grow`,
      );
      expect(messages, messages.join("\n")).toEqual([]);
    });

    it("rejects new production importers of root Helpers", () => {
      const present = new Set(
        walkFiles(RENDERER_ROOT)
          .filter((p) => !relative(RENDERER_ROOT, p).startsWith("helpers/"))
          .filter((p) => {
            const src = readFileSync(p, "utf8");
            const sf = ts.createSourceFile(
              p,
              src,
              ts.ScriptTarget.Latest,
              true,
              p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
            );
            let importsHelpers = false;
            const visit = (node: ts.Node) => {
              if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
                const target = resolveSpecifier(node.moduleSpecifier.text, p);
                const relT = target ? relative(RENDERER_ROOT, target).replace(/\\/g, "/") : "";
                if (relT.startsWith("helpers/")) importsHelpers = true;
              }
              ts.forEachChild(node, visit);
            };
            visit(sf);
            return importsHelpers;
          })
          .map((p) => resolve(p)),
      );
      const newImporters = [...present].filter((p) => !helperImporterBaseline.has(p));
      const messages = newImporters.map(
        (p) => `[archtest] NEW root Helpers importer ${relative(RENDERER_ROOT, p)} — Phase 21 baseline must not grow`,
      );
      expect(messages, messages.join("\n")).toEqual([]);
    });

    it("rejects new files in ui/hooks", () => {
      const present = new Set(walkFiles(join(RENDERER_ROOT, "ui", "hooks")));
      const newFiles = [...present].filter((p) => !uiHooksBaseline.has(p));
      const messages = newFiles.map(
        (p) =>
          `[archtest] NEW ui/hooks file ${relative(RENDERER_ROOT, p)} — ui/hooks is migration residue; use renderer/hooks`,
      );
      expect(messages, messages.join("\n")).toEqual([]);
    });

    it("rejects new root UI dependency violations (App/Domains/API/RPC/IPC/Stores/Commands/Runtime/Helpers)", () => {
      const present = new Set(
        walkFiles(RENDERER_ROOT)
          .filter((p) => relative(RENDERER_ROOT, p).startsWith("ui/"))
          .filter((p) => {
            const src = readFileSync(p, "utf8");
            const sf = ts.createSourceFile(
              p,
              src,
              ts.ScriptTarget.Latest,
              true,
              p.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
            );
            let violates = false;
            const visit = (node: ts.Node) => {
              if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
                const target = resolveSpecifier(node.moduleSpecifier.text, p);
                const relT = target ? relative(RENDERER_ROOT, target).replace(/\\/g, "/") : "";
                if (
                  relT.startsWith("app/") ||
                  relT.startsWith("domains/") ||
                  relT.startsWith("api/") ||
                  relT.startsWith("rpc/") ||
                  relT.startsWith("helpers/") ||
                  relT.startsWith("../main/") ||
                  relT.startsWith("main/") ||
                  relT.startsWith("stores/") ||
                  relT.startsWith("commands/") ||
                  relT.startsWith("runtime/")
                ) {
                  violates = true;
                }
              }
              ts.forEachChild(node, visit);
            };
            visit(sf);
            return violates;
          }),
      );
      const newViolations = [...present].filter((p) => !uiDepViolationBaseline.has(p));
      const messages = newViolations.map(
        (p) =>
          `[archtest] NEW root UI dependency violation ${relative(RENDERER_ROOT, p)} — root UI must stay domain-free`,
      );
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });
});
