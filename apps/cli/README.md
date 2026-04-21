# Yishan CLI

Go-based CLI built with Cobra, Viper, and Zerolog.

## Run

```bash
go run .
```

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

You can also set `--log-level` on any command.
