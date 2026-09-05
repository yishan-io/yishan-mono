# @yishan-io/dsh-dev-flow

Daemon-managed DeepSeek Harness plugin for Yishan's development workflow skills.

The package owns independent DSH-native skill assets. Its compiled `entry.mjs` mounts those assets through an isolated `dsh-skill-filesystem` provider. It does not depend on or load `@yishan-io/pi-dev-flow`, and it does not add a second skill registry or model tool.

Yishan ships a reproducible offline seed archive. The daemon verifies that archive against its approved catalog, installs it into the signed plugin snapshot under the account-scoped DSH data directory, and the existing managed plugin loader composes it before the daemon bridge starts.

Project and user skills keep DSH's normal precedence over these bundled fallback skills.

## Development

```bash
bun run --cwd packages/dsh-dev-flow build
bun run --cwd packages/dsh-dev-flow build:seed
bun run --cwd packages/dsh-dev-flow test
bun run --cwd packages/dsh-dev-flow typecheck
bun run --cwd packages/dsh-dev-flow lint
```

## License

MIT. See [LICENSE](./LICENSE).
