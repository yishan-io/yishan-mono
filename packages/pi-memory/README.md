# @yishan-io/pi-memory

Pi memory extension package for Yishan.

## What it provides

This package adds Pi-facing memory integration on top of the existing Yishan memory backend.

Current MVP features:
- injects `~/.yishan/memory/PERSONA.md` when allowed
- injects `.my-context/MEMORY.md` and a shallow `.my-context/` listing into Pi context
- registers `memory_search` backed by `yishan memory search --output json`
- registers `memory_read` for reading durable files under `.my-context/`
- registers `memory_store` for writing durable entries into `.my-context/MEMORY.md`
- registers `memory_reconcile` as a repair/admin path backed by `yishan memory reconcile`

## Architecture

This package uses a hybrid design:
- `packages/pi-memory` owns Pi extension behavior and Pi tools
- Yishan CLI/daemon still owns file watching, background indexing, reconcile, and SQLite/FTS search backend
- workflow guidance should come from Pi's `context-memory` skill

## Installation

As a Pi package:

```bash
pi install /absolute/path/to/packages/pi-memory
```

Or from a checked-out monorepo path:

```bash
pi install ./packages/pi-memory
```

## Backend requirement

Indexed search depends on the Yishan CLI memory backend being available:

```bash
yishan memory search --output json <query>
```

`memory_reconcile` depends on:

```bash
yishan memory reconcile
```

## Tools

| Tool | Purpose |
|---|---|
| `memory_search` | Search durable memory through the indexed Yishan backend |
| `memory_read` | Read one durable memory file under `.my-context/` |
| `memory_store` | Write one durable entry into `.my-context/MEMORY.md` |
| `memory_reconcile` | Repair/rebuild the memory index |

## Current limitations

- Indexed search still depends on Yishan CLI/daemon.
- This MVP does not migrate the old summarization pipeline into the package.
- `context-memory` remains the workflow/policy layer; this package does not replace it.

## Development

Package-local checks:

```bash
bun run --cwd packages/pi-memory typecheck
bun run --cwd packages/pi-memory lint
bun run --cwd packages/pi-memory test
```

## License

MIT — see [LICENSE](./LICENSE).
