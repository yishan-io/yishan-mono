/**
 * Extension factories injected into isolated child sessions.
 *
 * Child sessions run with `noExtensions: true` so settings.json packages do
 * not load inside sub-agents. Any extension whose tools should reach
 * sub-agents must be forwarded here as an inline factory. The pi-lsp
 * extension is optional: when installed, `lsp_diagnostics` and `lsp_fix`
 * become available to child sessions; otherwise child sessions simply run
 * without them. Task read support is also optional and never forwards mutation tools.
 */
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

let piTaskReadFactory: ExtensionFactory | undefined;
let piTaskChecked = false;

let piLspFactory: ExtensionFactory | undefined;
let piLspChecked = false;

/**
 * Resolves the extension factories to forward into one child session.
 * Resolution results are cached per process; a missing optional install is
 * remembered so later sessions do not retry the failed import.
 */
export async function resolveChildExtensionFactories(): Promise<ExtensionFactory[]> {
  const lsp = await resolvePiLspFactory();
  const taskRead = await resolvePiTaskReadFactory();
  return [lsp, taskRead].filter((factory): factory is ExtensionFactory => factory !== undefined);
}

/**
 * Test-only: clears the cached optional factory resolution so each test can
 * exercise the resolver from a fresh state.
 */
export function resetChildExtensionCache(): void {
  piLspFactory = undefined;
  piLspChecked = false;
  piTaskReadFactory = undefined;
  piTaskChecked = false;
}

/**
 * Loads pi-lsp's extension factory when the package is installed.
 */
async function resolvePiLspFactory(): Promise<ExtensionFactory | undefined> {
  if (piLspChecked) return piLspFactory;
  piLspChecked = true;
  try {
    // Optional peers may compile against a different host SDK. Validate the
    // module boundary rather than asserting that SDK type identities match.
    const mod: unknown = await import("@yishan-io/pi-lsp");
    if (mod && typeof mod === "object" && "createPiLspExtension" in mod) {
      const factory = mod.createPiLspExtension;
      if (typeof factory === "function")
        piLspFactory = async (pi) => {
          await factory(pi);
        };
    }
  } catch {
    // pi-lsp is an optional peer; child sessions run without LSP tools.
    piLspFactory = undefined;
  }
  return piLspFactory;
}

/** Loads only the supported read-only entry point, never the full Task extension. */
async function resolvePiTaskReadFactory(): Promise<ExtensionFactory | undefined> {
  if (piTaskChecked) return piTaskReadFactory;
  piTaskChecked = true;
  try {
    const mod: unknown = await import("@yishan-io/pi-task");
    if (mod && typeof mod === "object" && "createPiTaskReadExtension" in mod) {
      const factory = mod.createPiTaskReadExtension;
      if (typeof factory === "function")
        piTaskReadFactory = async (pi) => {
          await factory(pi);
        };
    }
  } catch {
    // Task is an optional peer; missing or older installs must not prevent child startup.
    piTaskReadFactory = undefined;
  }
  return piTaskReadFactory;
}
