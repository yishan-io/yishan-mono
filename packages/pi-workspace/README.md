# @yishan-io/pi-workspace

Pi workspace extension package for Yishan.

## What it provides

This package adds Pi-facing workspace lifecycle tools on top of the existing Yishan CLI.

Current MVP features:
- registers `workspace_list` backed by `yishan workspace list --output json`
- registers `workspace_find` backed by `yishan workspace find --output json`
- registers `workspace_create` backed by `yishan workspace create`
- registers `workspace_close` backed by `yishan workspace close --output json`
- defaults to `YISHAN_PROJECT_ID`, `YISHAN_WORKSPACE_ID`, and `YISHAN_ORG_ID` when tool arguments are omitted
- `workspace_create` defaults `sourceBranch` to `main` when omitted

## Installation

As a Pi package:

```bash
pi install /absolute/path/to/packages/pi-workspace
```

Or from a checked-out monorepo path:

```bash
pi install ./packages/pi-workspace
```

## Backend requirement

Workspace commands depend on the Yishan CLI and local daemon being available.

## Tools

| Tool | Purpose |
|---|---|
| `workspace_list` | List project workspaces |
| `workspace_find` | Look up one workspace by id |
| `workspace_create` | Create a worktree workspace |
| `workspace_close` | Close one workspace |

## Development

Package-local checks:

```bash
bun run --cwd packages/pi-workspace typecheck
bun run --cwd packages/pi-workspace lint
bun run --cwd packages/pi-workspace test
```

## License

MIT — see [LICENSE](./LICENSE).
