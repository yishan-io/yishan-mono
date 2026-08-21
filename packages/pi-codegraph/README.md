# @yishan-io/pi-codegraph

A Pi package that provides the frozen CodeGraph structural-code navigation tool contract.

## Prerequisites

Install the `codegraph` CLI and initialize CodeGraph in the project that Pi will inspect. The
project must contain an initialized `.codegraph` directory before CodeGraph can return indexed
results.

```bash
codegraph init
```

## Install

Install the package with npm when you use its exported extension factory in your own integration:

```bash
npm install @yishan-io/pi-codegraph
```

To install it as a Pi package, run:

```bash
pi install npm:@yishan-io/pi-codegraph
```

## Tools

The package registers these eight tools:

- `codegraph_search` — Search indexed symbols by name, kind, or structural-code query.
- `codegraph_callers` — Find symbols that call a selected symbol.
- `codegraph_callees` — Find symbols called by a selected symbol.
- `codegraph_impact` — Analyze the structural impact of changing a symbol.
- `codegraph_explore` — Explore code structure for a natural-language query.
- `codegraph_node` — Inspect an indexed symbol and optionally include its source code.
- `codegraph_status` — Show CodeGraph index and project status.
- `codegraph_files` — List indexed project files in tree, flat, or grouped format.

## Use with Pi

After installation, start Pi in the initialized project directory:

```bash
pi
```

To load the npm package for one Pi invocation without installing it permanently, run:

```bash
pi -e npm:@yishan-io/pi-codegraph
```

The extension launches a short-lived native MCP session for each tool call. It terminates the
CodeGraph process tree after the call completes, fails, or times out.

## Programmatic usage

Register the extension with an existing Pi `ExtensionAPI` instance:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiCodeGraphExtension } from "@yishan-io/pi-codegraph";

export function registerCodeGraph(pi: ExtensionAPI): void {
  createPiCodeGraphExtension(pi);
}
```

## Development

```bash
bun run --cwd packages/pi-codegraph typecheck
bun run --cwd packages/pi-codegraph lint
bun run --cwd packages/pi-codegraph test
```
