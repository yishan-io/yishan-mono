# Yishan CLI

Go-based CLI built with Cobra, Viper, and Zerolog.

## Run

Install the latest released CLI with Homebrew:

```bash
brew tap yishan-io/tap
brew install yishan
```

Run from source during development:

```bash
go run .
```

Common development commands via Makefile:

- `make fmt`
- `make test`
- `make build`
- `make run`
- `make daemon`

Run daemon mode:

```bash
go run . daemon --host 127.0.0.1 --port 0 --jwt-secret dev-secret
```

Use `--port 0` to allocate a random free port (default). Runtime daemon address is written to `daemon.state.json` next to your config file and used by CLI commands.

Daemon lifecycle commands:

- `yishan daemon stop`
- `yishan daemon restart`

JWT auth is enabled for `/ws` by default. Provide the token via:

- `Authorization: Bearer <token>`
- query string `?token=<token>` (or `?access_token=<token>`)

Daemon endpoints:

- WebSocket JSON-RPC: `/ws`
- Health check: `/healthz`

Supported JSON-RPC methods:

- `daemon.ping`
- `workspace.open`
- `workspace.list`
- `workspace.file.list`
- `workspace.file.stat`
- `workspace.file.read`
- `workspace.file.write`
- `workspace.file.delete`
- `workspace.file.move`
- `workspace.file.mkdir`
- `workspace.file.diff`
- `workspace.git.status`
- `workspace.git.listChanges`
- `workspace.git.track`
- `workspace.git.unstage`
- `workspace.git.revert`
- `workspace.git.commit`
- `workspace.git.branchStatus`
- `workspace.git.commitsToTarget`
- `workspace.git.commitDiff`
- `workspace.git.branchDiff`
- `workspace.git.branches`
- `workspace.git.push`
- `workspace.git.publish`
- `workspace.git.renameBranch`
- `workspace.git.removeBranch`
- `workspace.git.worktree.create`
- `workspace.git.worktree.remove`
- `workspace.git.authorName`
- `workspace.terminal.start`
- `workspace.terminal.send`
- `workspace.terminal.read`
- `workspace.terminal.resize`
- `workspace.terminal.stop`
- `workspace.terminal.subscribe`
- `workspace.terminal.unsubscribe`

API-backed subcommands:

- `login --provider google|github`
- `logout`
- `health`
- `whoami` (alias: `me`)
- `auth refresh --refresh-token <token>`
- `auth revoke --refresh-token <token>`
- `org list|create|delete|use|current|clear`
- `org member add|remove`
- `node list|create|delete`
- `project list|create`
- `workspace list|create`

Organization context:

- Set active org: `yishan org use <org-id>`
- Show active org: `yishan org current`
- Clear active org: `yishan org clear`
- Commands with `--org-id` fall back to active org when flag is omitted.
- `workspace create` creates workspace metadata via API first; for local nodes it then provisions via local daemon using the returned workspace id.

Terminal subscriptions stream server notifications:

- `workspace.terminal.output`
- `workspace.terminal.exit`

## Environment Variables

The CLI reads env vars with the `YISHAN_` prefix.

- `YISHAN_PROFILE` (default: `default`; config path: `~/.yishan/profiles/<profile>/credential.yaml`)
- `YISHAN_LOG_LEVEL` (default: `info`)
- `YISHAN_LOG_FORMAT` (default: `pretty`; options: `pretty`, `json`)
- `YISHAN_DAEMON_HOST` (default: `127.0.0.1`)
- `YISHAN_DAEMON_PORT` (default: `0`, random)
- `YISHAN_DAEMON_JWT_SECRET` (required when `YISHAN_DAEMON_JWT_REQUIRED=true`)
- `YISHAN_DAEMON_JWT_ISSUER` (optional)
- `YISHAN_DAEMON_JWT_AUDIENCE` (optional)
- `YISHAN_DAEMON_JWT_REQUIRED` (default: `true`)
- `YISHAN_API_BASE_URL` (default: `https://api.yishan.io`)
- `YISHAN_API_TOKEN` (optional Bearer token for protected API routes)

You can also set `--log-level` on any command.

## Release

The CLI is released with GoReleaser using component-specific tags like `cli-v1.0.0`.

- Local dry run: `goreleaser release --snapshot --clean --config .goreleaser.yaml`
- CI release workflow: `.github/workflows/cli-goreleaser.yml`
- Homebrew formula publishing uses `yishan-io/homebrew-tap` and requires the `HOMEBREW_TAP_GITHUB_TOKEN` repository secret.
