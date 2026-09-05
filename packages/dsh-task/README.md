# @yishan-io/dsh-task

Daemon-authoritative Local Task tools for the Yishan DSH runtime.

The package owns its task DTOs, Zod validation, typed capability client, and nine model-facing tools. It follows the behavior of `@yishan-io/pi-task`, but uses the DSH daemon bridge instead of a second WebSocket connection. The daemon remains responsible for task scope, metadata, templates, Task Context documents, and persistence.

## Development

```bash
bun run --cwd packages/dsh-task test
bun run --cwd packages/dsh-task typecheck
bun run --cwd packages/dsh-task lint
```

## License

MIT. See [LICENSE](./LICENSE).
