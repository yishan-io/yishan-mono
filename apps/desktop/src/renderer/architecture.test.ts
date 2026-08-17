// @vitest-environment node

/**
 * Architecture test — Desktop renderer dependency rules (Phases 1–20).
 *
 * Phase 16 restructured this file into one focused test group per stable rule
 * and hardened the allowlist lifecycle:
 *
 *   - each rule has its own `describe` with a focused assertion;
 *   - a NEW boundary violation fails the test with file + import target;
 *   - a STALE allowlist row (violation already fixed) fails the test;
 *   - an allowlist row tagged with a completed phase fails the test;
 *   - normal Zustand imports from Feature State files are permitted (no false
 *     positive), and State may import the owning Feature's Model.
 *
 * Rule set (desktop.md … desktop6.md):
 *
 *   - R1  UI (components/, ui/, Feature ui, app/routes/) must not VALUE-import
 *         renderer/api/* or renderer/rpc/*, `electron`, or main-process code.
 *   - R1b @shared/contracts DTO imports from UI: report-only (deferred).
 *   - R3  features/workbench/model/tabs|split-pane must not import react,
 *         zustand, transport, commands, or electron.
 *   - R4  Commands must not import Views or Components.
 *   - R5  Feature code must not import another Feature's internal State,
 *         Events, Runtime, or Store Model; only public surfaces (Commands,
 *         Selectors, Actions, index, Model types).
 *   - R6  State files own Zustand State, Selectors, and synchronous mutations;
 *         they may import Zustand and their own Feature's Model/State, but not
 *         transport, Electron, Commands, Runtime, or another Feature's State.
 *   - R7  Model files must not import React, Zustand, Electron, transport,
 *         Runtime, or State.
 *   - R8  Infrastructure (api/, rpc/) must not import Feature UI, app routes,
 *         or shared ui.
 *   - R9  Shared ui/ and components/ must not import Feature or app code.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { CURRENT_PHASE, KNOWN_VIOLATIONS, type KnownViolation, type RuleName } from "./architecture.knownViolations";

const RENDERER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const SHARED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../shared");
const MAIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../main");

const KNOWN_SET = new Set(KNOWN_VIOLATIONS.map((v) => `${v.rule}:${v.file}`));

/**
 * Recorded Phase 16 baseline counts (occurrences, not files). A phase must not
 * increase a count; update an entry only when a phase intentionally fixes
 * violations and its pull request records the new number.
 */
const BASELINE_COUNTS: Record<RuleName, number> = {
  "R1-value-api-rpc": 0,
  "R1-main": 0,
  "R1b-shared-contracts": 22,
  R3: 0,
  R4: 0,
  "R5-cross-feature-internal": 0,
  "R6-state-layer": 6,
  "R7-model-layer": 3,
  "R8-infra-layer": 0,
  "R9-ui-components": 68,
  "R10-workspace-workbench": 0,
};

function walkFiles(dir: string, out: string[] = []): string[] {
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

function scanViolations(): { violations: Violation[]; sharedContracts: Violation[] } {
  const violations: Violation[] = [];
  const sharedContracts: Violation[] = [];
  const files = walkFiles(RENDERER_ROOT);

  for (const file of files) {
    const rel = relative(RENDERER_ROOT, file).replace(/\\/g, "/");
    if (rel.startsWith("architecture.")) continue;
    const isUi =
      rel.startsWith("components/") ||
      rel.startsWith("ui/") ||
      rel.startsWith("app/routes/") ||
      /^features\/[^/]+\/ui\//.test(rel);
    const isPureDomain =
      rel.startsWith("features/workbench/model/tabs/") || rel.startsWith("features/workbench/model/split-pane/");

    for (const imp of extractImports(file)) {
      const target = resolveSpecifier(imp.spec, file);
      const relT = target ? relative(RENDERER_ROOT, target).replace(/\\/g, "/") : "";
      const relS = target ? relative(SHARED_ROOT, target).replace(/\\/g, "/") : "";
      // Dir-spec imports ("from \"../../api\"") resolve to the dir without a trailing
      // slash; treat the bare dir as transport too (Phase 4 gap closure).
      const isTransport = relT.startsWith("api/") || relT.startsWith("rpc/") || relT === "api" || relT === "rpc";
      const isCommands = relT.startsWith("commands/");
      const isViews = relT.startsWith("components/") || relT.startsWith("ui/") || /^features\/[^/]+\/ui\//.test(relT);
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
        sharedContracts.push({ rule: "R1b-shared-contracts", file: rel, target: imp.spec });
      }
      // ---- Rule 3: pure Workbench domain (tabs, split-pane) stays framework-free. ----
      if (
        isPureDomain &&
        (isTransport || isCommands || imp.spec === "electron" || imp.spec === "react" || imp.spec.startsWith("zustand"))
      ) {
        violations.push({ rule: "R3", file: rel, target: imp.spec });
      }
      // ---- Rule 4: Commands must not import Views or Components. ----
      if ((rel.startsWith("commands/") || /^features\/[^/]+\/commands\//.test(rel)) && isViews) {
        violations.push({ rule: "R4", file: rel, target: imp.spec });
      }
      // ---- Rule 5: Feature A must not import Feature B's internal State,
      // Runtime, Event Handler, or Store Model. Cross-feature imports are
      // allowed only to another feature's public surface: Commands, State
      // Selectors/Actions, Model types, or its index.ts (Phase 12, desktop5.md). ----
      const crossFeature = /^features\/([^/]+)\//.exec(rel);
      const crossTarget = /^features\/([^/]+)\//.exec(relT);
      // ---- Rule 6: State files own Zustand State, Selectors, and synchronous
      // mutations. They may import Zustand and the owning Feature's Model and
      // State. They must not import transport implementations, Electron,
      // Commands, Runtime implementations (own or other Feature), or another
      // Feature's State internals. Selectors/Actions files are the public State
      // surface and are excluded. (Phase 15, corrected in Phase 16) ----
      if (/^features\/[^/]+\/state\//.test(rel) && !rel.includes(".test.")) {
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
      // React, Zustand, Electron, transport, Runtime, or State (Phase 15). ----
      if (/^features\/[^/]+\/model\//.test(rel) && !rel.includes(".test.")) {
        if (
          imp.spec === "react" ||
          imp.spec === "zustand" ||
          imp.spec === "electron" ||
          isTransport ||
          relT.includes("/runtime/") ||
          relT.includes("/state/")
        ) {
          violations.push({ rule: "R7-model-layer", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 8: Infrastructure (api/, rpc/) must not import Feature UI,
      // app routes, or shared ui. ----
      if ((rel.startsWith("api/") || rel.startsWith("rpc/")) && !rel.includes(".test.")) {
        if (/^features\/[^/]+\/ui\//.test(relT) || relT.startsWith("app/routes/") || relT.startsWith("ui/")) {
          violations.push({ rule: "R8-infra-layer", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 9: Domain-free shared ui/components must not import Feature
      // internals or application code. ----
      if ((rel.startsWith("ui/") || rel.startsWith("components/")) && !rel.includes(".test.")) {
        if (/^features\//.test(relT) || relT.startsWith("app/")) {
          violations.push({ rule: "R9-ui-components", file: rel, target: imp.spec });
        }
      }
      // ---- Rule 10 (desktop6-adjust.md W1): Workspace Model and State must
      // not import Workbench, and Workbench Model must not import Workspace
      // State (Workspace Store types under Workbench Model are an ownership
      // inversion). Workspace Commands and UI may use the Workbench public API. ----
      if (/^features\/workspace\/(model|state)\//.test(rel) && relT.startsWith("features/workbench/")) {
        violations.push({ rule: "R10-workspace-workbench", file: rel, target: imp.spec });
      }
      if (/^features\/workbench\/model\//.test(rel) && relT.startsWith("features/workspace/")) {
        violations.push({ rule: "R10-workspace-workbench", file: rel, target: imp.spec });
      }
      // ---- Rule 5 (cont.): the owning Feature's public State surface
      // (Selectors = read models, Actions = state-change surface) is
      // importable; the Store itself and other internals are not. ----
      if (crossFeature && crossTarget && crossFeature[1] !== crossTarget[1]) {
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

function unbaselined(violations: Violation[], rule: RuleName): Violation[] {
  return violations.filter((v) => v.rule === rule && !KNOWN_SET.has(`${v.rule}:${v.file}`));
}

function failureMessages(fresh: Violation[]): string[] {
  return fresh.map(
    (v) =>
      `[archtest] NEW violation ${v.rule}: ${v.file} imports ${v.target} — fix it or add to KNOWN_VIOLATIONS with phase ${CURRENT_PHASE}`,
  );
}

describe("renderer architecture dependency rules", () => {
  let violations: Violation[];
  let sharedContracts: Violation[];

  beforeAll(() => {
    ({ violations, sharedContracts } = scanViolations());
  });

  describe("R1: UI must not import transport implementations or main-process code", () => {
    it("reports no unbaselined value imports of api/rpc/electron/main from UI code", () => {
      const fresh = [...unbaselined(violations, "R1-value-api-rpc"), ...unbaselined(violations, "R1-main")];
      const messages = failureMessages(fresh);
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R1b: @shared/contracts DTO imports from UI (deferred, report-only)", () => {
    it("stays at the recorded deferred baseline", () => {
      // eslint-disable-next-line no-console
      console.log(`[archtest] R1b @shared/contracts DTO imports (deferred): ${sharedContracts.length} imports`);
      expect(sharedContracts.length).toBe(BASELINE_COUNTS["R1b-shared-contracts"]);
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

  describe("R5: Features import other Features through public surfaces only", () => {
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

    it("permits normal Zustand imports from Feature State files (no false positive)", () => {
      const zustandFlags = violations.filter((v) => v.rule === "R6-state-layer" && v.target === "zustand");
      expect(zustandFlags, "State files use Zustand to define their stores").toEqual([]);
    });

    it("permits State imports of the owning Feature's Model", () => {
      const modelFlags = violations.filter((v) => v.rule === "R6-state-layer" && v.target.includes("/model/"));
      expect(modelFlags, "State files may read their owning Feature's Model types").toEqual([]);
    });
  });

  describe("R7: Model layer stays pure data and rules", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R7-model-layer"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R8: Infrastructure must not import Feature UI, app routes, or shared ui", () => {
    it("reports no unbaselined violations", () => {
      const messages = failureMessages(unbaselined(violations, "R8-infra-layer"));
      expect(messages, messages.join("\n")).toEqual([]);
    });
  });

  describe("R9: Shared UI must not import Feature or app code", () => {
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
      const badPhase = KNOWN_VIOLATIONS.filter((v: KnownViolation) => v.phase !== CURRENT_PHASE);
      const messages = badPhase.map(
        (v) =>
          `[archtest] allowlist row ${v.rule}: ${v.file} tagged ${v.phase} — rows must carry ${CURRENT_PHASE} (no allowlist rows for completed phases)`,
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
});
