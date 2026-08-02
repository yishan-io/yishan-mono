# 🧠 @yishan-io/pi-lsp — Language Server Tools for Pi

[![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@yishan-io/pi-lsp` is a native [Pi coding agent](https://pi.dev) extension that exposes diagnostics and source-fix tools through configurable Language Server Protocol routes. It is language-agnostic: servers are selected by config and file extension instead of hard-coded language families.

## ✨ Features

- Configure LSP servers with simple JSON keyed by server name.
- Routes diagnostics and source fixes by configured file extensions.
- Supports multiple servers for the same extension, so `biome` and `gopls` can coexist in one repository.
- One LSP client handles JSON-RPC framing, subprocess lifecycle, diagnostics, code actions, and workspace-edit application.
- Workspace roots, file limits, recursive file discovery, server overrides, and write-or-preview edits.
- Starts a language server only for a tool call, then shuts it down — no daemon, no orphaned processes.
- Shows statusline activity only while LSP tools are running.

## 🎯 When to use pi-lsp

Use pi-lsp when an LSP can answer a targeted question about the files being edited faster than the project's authoritative validation commands. It is most useful when:

- a full-project lint or typecheck is slow, but only a few files need intermediate feedback;
- structured diagnostics with exact ranges and severity are easier to act on than CLI output;
- a language server provides a useful source action such as `source.fixAll` or `source.organizeImports`;
- a multi-language repository benefits from one configurable interface for targeted diagnostics.

For most repositories, first document the authoritative format, lint, typecheck, build, and test commands in `AGENTS.md`. In the yishan monorepo that means `bun run typecheck`, `bun run lint`, `bun run test`, and `go build ./...` / `go test ./...`. If those commands are already fast and reliable, pi-lsp may add little value.

A practical workflow is:

1. Use `lsp_diagnostics` during an edit only when targeted feedback is useful.
2. Optionally use `lsp_fix` for a supported server-provided source action.
3. Before considering the task complete, run the repository's authoritative validation commands.
4. Treat pre-commit hooks and CI as the final enforcement layer.

### Current limitations

- Diagnostics are not continuously injected into the conversation; the agent must call `lsp_diagnostics`.
- Language servers start and stop for each tool call, so pi-lsp does not retain an editor-like incremental session.
- The current tools expose diagnostics and source code actions, not symbol navigation, references, or semantic rename.
- A clean LSP result does not replace the project's formatter, linter, type checker, build, or tests.

## 📦 Install

```bash
pi install npm:@yishan-io/pi-lsp
```

Try without installing permanently:

```bash
pi -e npm:@yishan-io/pi-lsp
```

Try this package locally from the monorepo root:

```bash
pi -e ./packages/pi-lsp
```

The yishan CLI (`yishan setup`) installs `@yishan-io/pi-lsp` alongside the other default Pi extensions.

## ⚙️ Configuration

If no config is provided, pi-lsp ships a broad catalog of direct-command defaults. Servers are started only when matching files are requested. pi-lsp does not download language servers, so install the commands you need and make them available on `PATH`. During no-config diagnostics, unavailable default commands are filtered before workspace discovery. If none can run, diagnostics completes successfully and reports the skipped servers. Explicitly selected or custom-configured missing commands still report an error.

The yishan monorepo stack is TypeScript/React (Biome) and Go (gopls), covered by these defaults:

| Language or format | Default server | Startup command | Extensions |
| --- | --- | --- | --- |
| JavaScript, TypeScript, JSON, CSS, GraphQL, HTML, Vue, Astro, Svelte | `biome` | `biome lsp-proxy` | `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.jsonc`, `.css`, `.graphql`, `.gql`, `.html`, `.vue`, `.astro`, `.svelte`, and module variants |
| Go | `gopls` | `gopls` | `.go` |
| Python typing | `ty` | `ty server` | `.py`, `.pyi` |
| Python linting and fixes | `ruff` | `ruff server` | `.py`, `.pyi` |
| Rust | `rust-analyzer` | `rust-analyzer` | `.rs` |
| Ruby | `rubocop` | `rubocop --lsp` | `.rb`, `.rake`, `.gemspec`, `.ru` |
| Elixir | `elixir-ls` | `language_server.sh` (`language_server.bat` on Windows) | `.ex`, `.exs` |
| Zig | `zls` | `zls` | `.zig`, `.zon` |
| C# | `csharp` | `roslyn-language-server --stdio --autoLoadProjects` | `.cs`, `.csx` |
| F# | `fsharp` | `fsautocomplete` | `.fs`, `.fsi`, `.fsx`, `.fsscript` |
| Swift and Objective-C++ | `sourcekit-lsp` | `sourcekit-lsp` | `.swift`, `.mm` |
| C and C++ | `clangd` | `clangd --background-index --clang-tidy` | C/C++ source and header extensions |
| Java | `jdtls` | `jdtls` | `.java` |
| Kotlin | `kotlin-lsp` | `kotlin-lsp --stdio` | `.kt`, `.kts` |
| YAML | `yaml-language-server` | `yaml-language-server --stdio` | `.yaml`, `.yml` |
| Lua | `lua-language-server` | `lua-language-server` | `.lua` |
| PHP | `intelephense` | `intelephense --stdio` | `.php` |
| Prisma | `prisma` | `prisma-language-server --stdio` | `.prisma` |
| Dart | `dart` | `dart language-server` | `.dart` |
| OCaml | `ocaml-lsp` | `ocamllsp` | `.ml`, `.mli` |
| Bash | `bash-language-server` | `bash-language-server start` | `.sh`, `.bash` |
| Terraform | `terraform-ls` | `terraform-ls serve` | `.tf`, `.tfvars` |
| LaTeX and BibTeX | `texlab` | `texlab` | `.tex`, `.bib` |
| Gleam | `gleam` | `gleam lsp` | `.gleam` |
| Clojure | `clojure-lsp` | `clojure-lsp listen` | `.clj`, `.cljs`, `.cljc`, `.edn` |
| Nix | `nixd` | `nixd` | `.nix` |
| Typst | `tinymist` | `tinymist` | `.typ`, `.typc` |
| Haskell | `haskell-language-server` | `haskell-language-server-wrapper --lsp` | `.hs`, `.lhs` |

For example, install the Go server with its official toolchain:

```bash
go install golang.org/x/tools/gopls@latest
```

Ensure the Go install directory (`$GOBIN` or `$(go env GOPATH)/bin`) is also on `PATH`.

Custom config is resolved in this order:

1. `<workspace>/.pi/lsp.json`, only when Pi trusts the current project
2. `<agent dir>/lsp.json` — the agent dir comes from `getAgentDir()`, which follows the `PI_CODING_AGENT_DIR` env var. Under the yishan CLI that is `~/.yishan/pi/agent/lsp.json`; under stock Pi it is `~/.pi/agent/lsp.json`
3. the built-in server catalog

An untrusted project's config files are ignored. A `root` passed to an LSP tool selects files and the server working directory; it does not grant that directory authority to provide project settings. Project settings always come from the trusted Pi session workspace.

Providing custom config replaces the default server map. The following `lsp.json` example intentionally keeps the yishan stack plus two extras:

```json
{
  "biome": {
    "command": ["biome", "lsp-proxy"],
    "extensions": [".ts", ".tsx", ".js", ".jsx", ".json", ".css"]
  },
  "gopls": {
    "command": ["gopls"],
    "extensions": [".go"]
  },
  "rust-analyzer": {
    "command": ["rust-analyzer"],
    "extensions": [".rs"],
    "pullDiagnosticsGraceMs": 5000
  },
  "ruff": {
    "command": ["ruff", "server"],
    "extensions": [".py", ".pyi"]
  }
}
```

Use the `servers` wrapper when you need global options such as timeout:

```json
{
  "timeout": 30000,
  "servers": {
    "biome": {
      "command": ["biome", "lsp-proxy"],
      "extensions": [".ts", ".tsx", ".json"],
      "skipDirectories": ["generated"]
    }
  }
}
```

Each server entry supports:

- `command`: argv array used to start the LSP server.
- `extensions`: file extensions that should route to this server.
- `env`: environment overrides for the LSP server process. The child inherits Pi's environment, then applies these values; an `env.PATH` value is also used to resolve `command[0]`.
- `initialization`: LSP initialization options and workspace configuration values.
- `skipDirectories`: additional directory names to exclude from recursive discovery. Explicitly requested paths remain available.
- `diagnosticsSettleMs`: positive number of milliseconds without another push-diagnostics publication before using the latest result. Defaults to `800`; the built-in intelephense route uses `4000`. The global timeout remains the upper bound.
- `pushDiagnosticsGraceMs`: positive number of milliseconds to wait for the first publication from a push-only server. It is unset by default, so a silent push-only server waits for the global timeout. The built-in Lua and Haskell routes use `3000`; Dart, Terraform, Gleam, and Tinymist use `2000`.
- `pullDiagnosticsGraceMs`: positive number of milliseconds to wait for a newer push publication after a server returns an empty pull-diagnostics result. It is unset by default; the built-in rust-analyzer route uses `5000`.

Global options:

- `timeout`: request timeout in milliseconds. Defaults to `20000`.

pi-lsp infers `languageId` from common extensions and falls back to the extension without the leading dot.

## 🛠️ Pi tools

### `lsp_diagnostics`

Run diagnostics through configured servers.

Parameters:

- `paths?`: files or directories to check. Defaults to the workspace root.
- `root?`: workspace root. Defaults to cwd.
- `limit?`: maximum files to open per selected server.
- `server?`: configured server name, or an array of names. Defaults to all matching servers.

### `lsp_fix`

Apply source fixes or import organization through a configured server that matches its extension. If multiple servers match, pass `server` explicitly.

Parameters:

- `path`: file to fix.
- `root?`: workspace root. Defaults to cwd.
- `kind?`: source action kind. Defaults to `source.fixAll`.
- `write?`: write fixed text back to the file. Defaults to false.
- `server?`: optional configured server name.

## 💬 Command

```text
/lsp
```

Shows configured LSP commands and whether each command is available on `PATH`.

## 🗂️ Package layout

```txt
packages/pi-lsp/
├── extensions/
│   └── index.ts            # Pi extension entrypoint
├── src/
│   ├── index.ts
│   ├── extension.ts        # tools + /lsp command + status hooks
│   ├── config/
│   │   ├── config.ts       # config loading and validation
│   │   └── catalog.ts      # built-in server catalog
│   ├── lsp/
│   │   ├── transport.ts    # JSON-RPC framing and subprocess lifecycle
│   │   ├── client.ts       # LSP protocol: diagnostics, code actions
│   │   └── diagnostics.ts  # push-diagnostics waiting and settling
│   ├── tools/
│   │   ├── registerLspTools.ts
│   │   ├── selectServers.ts # route selection
│   │   ├── runDiagnostics.ts
│   │   ├── runFix.ts
│   │   └── result.ts       # tool-result formatting
│   ├── helpers/
│   │   ├── files.ts        # workspace-rooted file discovery
│   │   ├── textEdits.ts    # workspace-edit application
│   │   └── commands.ts     # command resolution and env merging
│   └── types.ts
├── test/
│   ├── support.ts          # mock pi/context helpers
│   └── fixtures/
│       └── mock-lsp-server.mjs
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

## 🔎 Keywords

Pi extension, Pi Coding Agent, Language Server Protocol, LSP diagnostics, code actions, source fixes, configurable language servers, TypeScript Pi package.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
