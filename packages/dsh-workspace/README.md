# @yishan-io/dsh-workspace

This package provides workspace lifecycle tools for DeepSeek Harness.

## Public contract

The package owns and exports workspace list, find, create, and close DTOs and its workspace capability client. `@yishan-io/dsh-daemon-bridge` provides only the base capability transport.

The Cordis plugin registers these model-facing tools:

- `workspace_list`
- `workspace_find`
- `workspace_create`
- `workspace_close`

Each tool binds the workspace client to its current execution and authorized workspace identity.
The tool returns the client result as canonical JSON.
The DSH renderer shows formatted JSON text.

## Use

```ts
import * as workspacePlugin from "@yishan-io/dsh-workspace";

await context.plugin(workspacePlugin);
```

The plugin injects the installed `daemonBridge` service, resolves session bindings, and registers its tools. This package does not own stdio, daemon RPC transport, CLI, or shell integration.

## Development

Run these commands from the repository root:

```bash
bun run --cwd packages/dsh-workspace test
bun run --cwd packages/dsh-workspace typecheck
bun run --cwd packages/dsh-workspace lint
```

## License

MIT. See [LICENSE](./LICENSE).
