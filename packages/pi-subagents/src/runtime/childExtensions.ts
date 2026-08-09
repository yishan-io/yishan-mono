/**
 * Extension factories injected into isolated child sessions.
 *
 * Child sessions run with `noExtensions: true` so settings.json packages do
 * not load inside sub-agents. Any extension whose tools should reach
 * sub-agents must be forwarded here as an inline factory. The pi-lsp
 * extension is optional: when installed, `lsp_diagnostics` and `lsp_fix`
 * become available to child sessions; otherwise child sessions simply run
 * without them.
 */
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

type PiLspModule = { createPiLspExtension?: ExtensionFactory };

let piLspFactory: ExtensionFactory | undefined;
let piLspChecked = false;

/**
 * Resolves the extension factories to forward into one child session.
 * Resolution results are cached per process; a missing pi-lsp install is
 * remembered so later sessions do not retry the failed import.
 */
export async function resolveChildExtensionFactories(): Promise<ExtensionFactory[]> {
  const lsp = await resolvePiLspFactory();
  return lsp ? [lsp] : [];
}

/**
 * Test-only: clears the cached pi-lsp factory resolution so each test can
 * exercise the resolver from a fresh state.
 */
export function resetChildExtensionCache(): void {
  piLspFactory = undefined;
  piLspChecked = false;
}

/**
 * Loads pi-lsp's extension factory when the package is installed.
 */
async function resolvePiLspFactory(): Promise<ExtensionFactory | undefined> {
  if (piLspChecked) return piLspFactory;
  piLspChecked = true;
  try {
    const mod = (await import("@yishan-io/pi-lsp")) as PiLspModule;
    piLspFactory = typeof mod.createPiLspExtension === "function" ? mod.createPiLspExtension : undefined;
  } catch {
    // pi-lsp is an optional peer; child sessions run without LSP tools.
    piLspFactory = undefined;
  }
  return piLspFactory;
}
