# @yishan-io/dsh-plugin-loader

Verified official and developer-local Cordis plugin loading for the Yishan DSH runtime.

The package owns signed snapshot verification, full-tree integrity checks, data-only Cordis entry policy, deterministic load ordering, and load-state reporting.

## Development

Run from the repository root:

```bash
bun run --cwd packages/dsh-plugin-loader test
bun run --cwd packages/dsh-plugin-loader typecheck
bun run --cwd packages/dsh-plugin-loader lint
```

## License

MIT. See [LICENSE](./LICENSE).
