/**
 * Built-in language server catalog. Servers are matched to files by
 * extension and launched only when a matching file is requested; the
 * commands must be installed on PATH because pi-lsp never downloads servers.
 */
import process from "node:process";

import type { NamedServer } from "../types";

/**
 * Directory names excluded from recursive file discovery for every server.
 */
export const COMMON_SKIP_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".mypy_cache",
  ".next",
  ".nuxt",
  ".output",
  ".ruff_cache",
  ".svelte-kit",
  ".tox",
  ".venv",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
  "venv",
]);

/**
 * File extensions handled by the Biome server.
 */
export const BIOME_EXTENSIONS = [
  ".astro",
  ".css",
  ".cts",
  ".cjs",
  ".graphql",
  ".gql",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".mts",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
];

/**
 * The default server catalog. Per-server grace/settle values tune
 * diagnostics timing for servers with unusual publication behavior.
 */
export const DEFAULT_SERVERS: NamedServer[] = [
  {
    name: "biome",
    command: ["biome", "lsp-proxy"],
    extensions: BIOME_EXTENSIONS,
  },
  {
    name: "ty",
    command: ["ty", "server"],
    extensions: [".py", ".pyi"],
  },
  {
    name: "ruff",
    command: ["ruff", "server"],
    extensions: [".py", ".pyi"],
  },
  {
    name: "rust-analyzer",
    command: ["rust-analyzer"],
    extensions: [".rs"],
    // An early empty pull result can precede real analysis; wait for the
    // follow-up publication.
    pullDiagnosticsGraceMs: 5_000,
  },
  {
    name: "gopls",
    command: ["gopls"],
    extensions: [".go"],
  },
  {
    name: "rubocop",
    command: ["rubocop", "--lsp"],
    extensions: [".rb", ".rake", ".gemspec", ".ru"],
  },
  {
    name: "elixir-ls",
    command: [process.platform === "win32" ? "language_server.bat" : "language_server.sh"],
    extensions: [".ex", ".exs"],
    skipDirectories: ["_build", "deps"],
  },
  {
    name: "zls",
    command: ["zls"],
    extensions: [".zig", ".zon"],
    skipDirectories: [".zig-cache", "zig-out"],
  },
  {
    name: "csharp",
    command: ["roslyn-language-server", "--stdio", "--autoLoadProjects"],
    extensions: [".cs", ".csx"],
    skipDirectories: ["bin", "obj"],
  },
  {
    name: "fsharp",
    command: ["fsautocomplete"],
    extensions: [".fs", ".fsi", ".fsx", ".fsscript"],
    skipDirectories: ["bin", "obj"],
    initialization: { AutomaticWorkspaceInit: true },
  },
  {
    name: "sourcekit-lsp",
    command: ["sourcekit-lsp"],
    extensions: [".swift", ".mm"],
    skipDirectories: [".build", "DerivedData"],
  },
  {
    name: "clangd",
    command: ["clangd", "--background-index", "--clang-tidy"],
    extensions: [".c", ".cpp", ".cc", ".cxx", ".c++", ".h", ".hpp", ".hh", ".hxx", ".h++"],
    skipDirectories: ["build"],
  },
  {
    name: "jdtls",
    command: ["jdtls"],
    extensions: [".java"],
    skipDirectories: [".gradle", "build"],
  },
  {
    name: "kotlin-lsp",
    command: ["kotlin-lsp", "--stdio"],
    extensions: [".kt", ".kts"],
    skipDirectories: [".gradle", "build"],
  },
  {
    name: "yaml-language-server",
    command: ["yaml-language-server", "--stdio"],
    extensions: [".yaml", ".yml"],
  },
  {
    name: "lua-language-server",
    command: ["lua-language-server"],
    extensions: [".lua"],
    // LuaLS stays silent for a clean document; treat silence as clean.
    pushDiagnosticsGraceMs: 3_000,
  },
  {
    name: "intelephense",
    command: ["intelephense", "--stdio"],
    extensions: [".php"],
    initialization: { intelephense: { telemetry: { enabled: false } } },
    // Publishes empty on open, then real diagnostics shortly after.
    diagnosticsSettleMs: 4000,
  },
  {
    name: "prisma",
    command: ["prisma-language-server", "--stdio"],
    extensions: [".prisma"],
  },
  {
    name: "dart",
    command: ["dart", "language-server"],
    extensions: [".dart"],
    skipDirectories: [".dart_tool", "build"],
    // The analysis server can remain silent for a clean document.
    pushDiagnosticsGraceMs: 2_000,
  },
  {
    name: "ocaml-lsp",
    command: ["ocamllsp"],
    extensions: [".ml", ".mli"],
    skipDirectories: ["_build", "_opam"],
  },
  {
    name: "bash-language-server",
    command: ["bash-language-server", "start"],
    extensions: [".sh", ".bash"],
  },
  {
    name: "terraform-ls",
    command: ["terraform-ls", "serve"],
    extensions: [".tf", ".tfvars"],
    skipDirectories: [".terraform"],
    pushDiagnosticsGraceMs: 2_000,
    initialization: {
      experimentalFeatures: { prefillRequiredFields: true },
    },
  },
  {
    name: "texlab",
    command: ["texlab"],
    extensions: [".tex", ".bib"],
  },
  {
    name: "gleam",
    command: ["gleam", "lsp"],
    extensions: [".gleam"],
    skipDirectories: ["build"],
    pushDiagnosticsGraceMs: 2_000,
  },
  {
    name: "clojure-lsp",
    command: ["clojure-lsp", "listen"],
    extensions: [".clj", ".cljs", ".cljc", ".edn"],
    skipDirectories: [".cpcache"],
  },
  {
    name: "nixd",
    command: ["nixd"],
    extensions: [".nix"],
  },
  {
    name: "tinymist",
    command: ["tinymist"],
    extensions: [".typ", ".typc"],
    pushDiagnosticsGraceMs: 2_000,
  },
  {
    name: "haskell-language-server",
    command: ["haskell-language-server-wrapper", "--lsp"],
    extensions: [".hs", ".lhs"],
    skipDirectories: [".stack-work", "dist-newstyle"],
    pushDiagnosticsGraceMs: 3_000,
  },
];

/**
 * Maps common file extensions to LSP language ids, falling back to the
 * extension without its leading dot.
 */
export const LANGUAGE_IDS: Record<string, string> = {
  ".bash": "shellscript",
  ".bib": "bibtex",
  ".c": "c",
  ".c++": "cpp",
  ".cc": "cpp",
  ".cjs": "javascript",
  ".clj": "clojure",
  ".cljc": "clojure",
  ".cljs": "clojure",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".csx": "csharp",
  ".cts": "typescript",
  ".cxx": "cpp",
  ".dart": "dart",
  ".edn": "clojure",
  ".ex": "elixir",
  ".exs": "elixir",
  ".fs": "fsharp",
  ".fsi": "fsharp",
  ".fsscript": "fsharp",
  ".fsx": "fsharp",
  ".gemspec": "ruby",
  ".go": "go",
  ".gql": "graphql",
  ".h": "c",
  ".h++": "cpp",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".hs": "haskell",
  ".hxx": "cpp",
  ".jl": "julia",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".jsonc": "jsonc",
  ".ksh": "shellscript",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".lhs": "lhaskell",
  ".m": "objective-c",
  ".mjs": "javascript",
  ".ml": "ocaml",
  ".mli": "ocaml.interface",
  ".mm": "objective-cpp",
  ".mts": "typescript",
  ".nix": "nix",
  ".php": "php",
  ".py": "python",
  ".pyi": "python",
  ".rake": "ruby",
  ".rb": "ruby",
  ".rs": "rust",
  ".ru": "ruby",
  ".sh": "shellscript",
  ".swift": "swift",
  ".tex": "latex",
  ".tf": "terraform",
  ".tfvars": "terraform-vars",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".typ": "typst",
  ".typc": "typst-code",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zig": "zig",
  ".zon": "zig",
  ".zsh": "shellscript",
};
