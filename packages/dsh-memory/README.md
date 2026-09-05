# @yishan-io/dsh-memory

Daemon-authoritative durable memory tools for the Yishan DSH runtime.

The package owns its memory DTOs and typed capability client. The plugin registers `memory_search`, `memory_read`, `memory_store`, and `memory_reconcile`. Every operation uses the base bridge transport with a session-authorized workspace identity. The package does not read memory files or indexes directly.

## Development

```bash
bun run --cwd packages/dsh-memory test
bun run --cwd packages/dsh-memory typecheck
bun run --cwd packages/dsh-memory lint
```

## License

MIT. See [LICENSE](./LICENSE).
