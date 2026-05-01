# Yishan

Make development work feel lighter.

Yishan helps development teams offload the operational overhead that builds up during rapid software cycles: switching between tasks, restoring workspace context, coordinating agent work, and keeping project state close at hand.

The product is designed around one purpose: make it easier to move between work without losing momentum. Current features focus on shared context between workspaces, workspace management, git and terminal workflows, and bring-your-own-agent support. Future features should continue to reduce context switching and make development work easier to resume, hand off, and automate.

Yishan runs as a desktop workspace backed by a local daemon and API service. The API service manages shared account and project data, while the local daemon handles machine-local execution such as filesystem, git, terminal, and agent CLI operations.

## Product Principles

- Reduce context switching between tasks, projects, and workspaces.
- Preserve and share useful development context between workspaces so work can be resumed or handed off faster.
- Let teams bring their own agent CLIs instead of forcing one agent runtime.
- Keep execution close to the developer machine when local filesystem, git, terminal, or CLI access is required.
- Design new features only when they support lighter, faster development cycles.

## Repository Layout

- `apps/desktop`: Electron/Vite desktop client.
- `apps/cli`: Go CLI and local daemon. The daemon exposes WebSocket JSON-RPC for workspace, file, git, terminal, and agent operations.
- `apps/api-service`: Hono API service for auth, organizations, projects, nodes, workspaces, and user preferences.
- `apps/mobile` and `apps/web`: app surfaces reserved for mobile and web clients.
- `packages/design-tokens`: shared design token package.
- `packages/core` and `packages/runtime`: shared package slots for cross-app runtime/core code.

## Requirements

- Bun `1.3.3`
- Go `1.24.x`
- Node-compatible tooling for Electron/Vite builds

Install workspace dependencies:

```bash
bun install
```

## Development

Run the desktop app in development mode:

```bash
bun --cwd apps/desktop run dev
```

Run the API service locally:

```bash
bun --cwd apps/api-service run dev:bun
```

Run the CLI from source:

```bash
cd apps/cli
go run .
```

Run the CLI daemon in the foreground:

```bash
cd apps/cli
go run . daemon run --host 127.0.0.1 --port 0
```

Build the desktop app with an embedded CLI binary:

```bash
bun --cwd apps/desktop run build:app:dir
```

## Runtime Model

Yishan uses the API service for account, organization, project, node, workspace, and preference data. The local Go daemon is the execution node for operations that need filesystem, git, terminal, and agent CLI access on the user's machine.

Daemon endpoints:

- `/ws`: WebSocket JSON-RPC API.
- `/healthz`: health and daemon identity.

Daemon state is written next to the active CLI profile config at `~/.yishan/profiles/<profile>/daemon.state.json`.

## Agent Runtime Setup

On daemon startup, Yishan installs managed agent runtime files under `~/.yishan`:

- `~/.yishan/bin`: wrapper executables for supported agent CLIs.
- `~/.yishan/lib`: shared wrapper helper scripts.
- `~/.yishan/notify.sh` and `~/.yishan/notify.ps1`: hook notification bridges.
- `~/.yishan/shell`: zsh and bash wrapper startup files that keep `~/.yishan/bin` at the front of `PATH` in managed terminal sessions.
- `~/.yishan/opencode-config-home`: managed OpenCode config home used by the OpenCode wrapper.

Supported agents:

- OpenCode
- Codex
- Claude
- Gemini
- Pi
- Copilot
- Cursor Agent

## Checks

Run CLI tests:

```bash
cd apps/cli
go test ./...
```

Run desktop type checks:

```bash
bun --cwd apps/desktop run check
```

Run API type checks:

```bash
bun --cwd apps/api-service run check
```

## Configuration

The CLI reads `YISHAN_`-prefixed environment variables. Common values:

- `YISHAN_PROFILE`: profile name, default `default`.
- `YISHAN_API_BASE_URL`: API service URL, default `https://api.yishan.io`.
- `YISHAN_API_TOKEN`: API bearer token.
- `YISHAN_DAEMON_HOST`: daemon host, default `127.0.0.1`.
- `YISHAN_DAEMON_PORT`: daemon port, default `0` for a random free port.
- `YISHAN_DAEMON_JWT_REQUIRED`: whether daemon WebSocket auth is required, default `true`.

See `apps/cli/README.md` for detailed CLI commands and daemon JSON-RPC methods.
