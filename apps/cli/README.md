# Yishan CLI

Go-based CLI built with Cobra, Viper, and Zerolog.

## Install

### Homebrew (macOS)

```bash
brew tap yishan-io/tap
brew install yishan
```

### Universal install script (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh -s -- --version 0.11.1
```

Install and set up as a launch daemon (launchd on macOS, systemd on Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh -s -- --daemon
```

Custom install directory (default: `/usr/local/bin`):

```bash
curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh -s -- --bin-dir ~/.local/bin
```

Skip confirmation prompt (for CI/scripts):

```bash
curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh -s -- --force
```

### From source

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
- `workspace list|get|create|close`

Organization context:

- Set active org: `yishan org use <org-id>`
- Show active org: `yishan org current`
- Clear active org: `yishan org clear`
- Commands with `--org-id` fall back to active org when flag is omitted.
- `workspace create` creates workspace metadata via API first; for local nodes it then provisions via local daemon using the returned workspace id.

Workspace lifecycle examples:

- Create a worktree workspace:
  - `yishan workspace create --project-id <project-id> --branch feature/my-branch --source-branch main --name feature-my-branch`
- Primary workspaces are created when you create a new project.
- Close a workspace by id:
  - `yishan workspace close --project-id <project-id> --workspace-id <workspace-id>`
- Get a workspace by id:
  - `yishan workspace get --project-id <project-id> --workspace-id <workspace-id>`

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

The CLI version is defined in `apps/cli/VERSION`. This is the single source of truth used by local builds, desktop builds, and the install script.

Release with GoReleaser using component-specific tags:

```bash
# 1. Bump the version
echo "0.12.0" > VERSION

# 2. Commit and tag
git add VERSION
git commit -m "chore(cli): bump version to 0.12.0"
git tag cli-v0.12.0
git push origin main --tags
```

The CI workflow (`.github/workflows/cli-goreleaser.yml`) triggers on `cli-v*` tags and:

1. Cross-compiles for darwin/linux/windows on amd64/arm64
2. Creates a GitHub Release with archives and checksums
3. Publishes the Homebrew formula to `yishan-io/homebrew-tap`

- Local dry run: `goreleaser release --snapshot --clean --config .goreleaser.yaml`
- Homebrew formula publishing requires the `HOMEBREW_TAP_GITHUB_TOKEN` repository secret.
