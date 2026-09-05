# @yishan-io/dsh-session

Session execution, persistence, query, and daemon request handling for the Yishan DSH runtime.

The Cordis plugin installs its session services and registers typed routes with `@yishan-io/dsh-daemon-bridge`.

## Development

Run from the repository root:

```bash
bun run --cwd packages/dsh-session test
bun run --cwd packages/dsh-session typecheck
bun run --cwd packages/dsh-session lint
```

## License

MIT. See [LICENSE](./LICENSE).
