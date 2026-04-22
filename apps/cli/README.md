# Yishan CLI

Go-based CLI built with Cobra, Viper, and Zerolog.

## Run

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
go run . daemon --host 127.0.0.1 --port 7788 --jwt-secret dev-secret
```

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
- `health`
- `me`
- `auth refresh --refresh-token <token>`
- `auth revoke --refresh-token <token>`
- `org list|create|delete`
- `org member add|remove`
- `node list|create|delete`
- `project list|create`
- `workspace list|create`

Terminal subscriptions stream server notifications:

- `workspace.terminal.output`
- `workspace.terminal.exit`

## Environment Variables

The CLI reads env vars with the `YISHAN_` prefix.

- `YISHAN_LOG_LEVEL` (default: `info`)
- `YISHAN_DAEMON_HOST` (default: `127.0.0.1`)
- `YISHAN_DAEMON_PORT` (default: `7788`)
- `YISHAN_DAEMON_JWT_SECRET` (required when `YISHAN_DAEMON_JWT_REQUIRED=true`)
- `YISHAN_DAEMON_JWT_ISSUER` (optional)
- `YISHAN_DAEMON_JWT_AUDIENCE` (optional)
- `YISHAN_DAEMON_JWT_REQUIRED` (default: `true`)
- `YISHAN_API_BASE_URL` (default: `http://127.0.0.1:3001`)
- `YISHAN_API_TOKEN` (optional Bearer token for protected API routes)

You can also set `--log-level` on any command.

## Release

The CLI is released with GoReleaser using tags like `v1.0.0`.

- Local dry run: `goreleaser release --snapshot --clean --config .goreleaser.yaml`
- CI release workflow: `.github/workflows/cli-goreleaser.yml`
