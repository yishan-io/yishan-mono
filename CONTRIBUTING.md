# Contributing to Yishan

## Repository Layout

```
apps/
  desktop/       Electron + Vite desktop client (TypeScript, React, MUI, Zustand)
  cli/           Go CLI and local daemon with WebSocket JSON-RPC APIs
  api-service/   Hono API service (Cloudflare Workers compatible)
  landing/       Marketing page (Next.js)
packages/
  design-tokens/ Shared MUI + React Native theme tokens
  core/          Shared cross-app types
  runtime/       Shared cross-app runtime utilities
```

## Requirements

- Bun `1.3.3` (see root `package.json` `packageManager` field)
- Go `1.24.x`
- Node-compatible tooling for Electron/Vite builds

Install workspace dependencies:

```bash
bun install
```

## Quick Start

Start the desktop app:

```bash
bun --cwd apps/desktop run dev
```

Start the API service:

```bash
bun --cwd apps/api-service run dev:bun
```

Run the CLI from source:

```bash
go run ./apps/cli
```

Run the daemon in the foreground:

```bash
go run ./apps/cli daemon run --host 127.0.0.1 --port 0
```

Build the desktop app with an embedded CLI binary:

```bash
bun --cwd apps/desktop run build:app:dir
```

## Runtime Model

Yishan separates cloud-shared state from local execution:

- **API service**: account, organization, project, node, workspace, and preference data.
- **Local daemon**: filesystem, git, terminal, and agent CLI execution on the user's machine.

Daemon endpoints:

- `/ws`: WebSocket JSON-RPC API
- `/healthz`: health and daemon identity

Daemon state is written to `~/.yishan/profiles/<profile>/daemon.state.json`.

## Agent Runtime Setup

On daemon startup, managed runtime files are installed under `~/.yishan`:

- `~/.yishan/bin`: wrapper executables for supported agent CLIs.
- `~/.yishan/lib`: shared wrapper helper scripts.
- `~/.yishan/notify.sh` and `~/.yishan/notify.ps1`: hook notification bridges.
- `~/.yishan/shell`: zsh/bash startup wrappers that keep `~/.yishan/bin` first in `PATH` for managed sessions.
- `~/.yishan/opencode-config-home`: managed OpenCode config home.
- `~/.yishan/pi/agent`: managed Pi agent root files (`APPEND_SYSTEM.md`, `keybindings.json`), packages, sessions, skills, and sub-agent definitions.

Supported agents:

- OpenCode
- Codex
- Claude
- Gemini
- Pi
- Copilot
- Cursor Agent

## Validation Checks

Run CLI tests:

```bash
go test ./apps/cli/...
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

The CLI reads `YISHAN_`-prefixed environment variables:

- `YISHAN_PROFILE`: profile name (default: `default`).
- `YISHAN_API_BASE_URL`: API service URL (default: `https://api.yishan.io`).
- `YISHAN_API_TOKEN`: API bearer token.
- `YISHAN_DAEMON_HOST`: daemon host (default: `127.0.0.1`).
- `YISHAN_DAEMON_PORT`: daemon port (default: `0`, random free port).
- `YISHAN_DAEMON_JWT_REQUIRED`: whether daemon WebSocket auth is required (default: `true`).

For detailed CLI commands and daemon JSON-RPC methods, see `apps/cli/README.md`.
