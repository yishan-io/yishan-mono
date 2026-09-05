# @yishan-io/dsh-provider

Provider adapters, account-scoped credentials, and the model catalog for the Yishan DSH runtime.

The Cordis plugin registers its adapters, exposes `ProviderCatalogService` to first-party plugins, and owns the `providers.list` daemon route.

## Development

Run from the repository root:

```bash
bun run --cwd packages/dsh-provider test
bun run --cwd packages/dsh-provider typecheck
bun run --cwd packages/dsh-provider lint
```

## License

MIT. See [LICENSE](./LICENSE).
