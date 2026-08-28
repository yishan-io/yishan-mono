# @yishan-io/dsh-yishan

Yishan-owned DeepSeek Harness composition contracts and plugins.

The package extends DSH SDK JSON-RPC with versioned `yishan.v1.*` methods. One combined JSON-RPC server owns stdio; sibling plugins must not read stdin independently. The Yishan daemon exclusively owns this inherited channel and validates that each requested cwd is an open local workspace before forwarding it. The DSH handler then requires the persisted session header to match that cwd.

Production composition is MCP-disabled (`YISHAN_RUNTIME_MCP_ENABLED` is `false`). Stock `initialize` and `shutdown` remain compatible, but stock `session/new` is denied and stock `session/prompt` is accepted only when `params.sessionId` is a non-empty string owned by `YishanSessionExecutionOwner`. Yishan session extensions are the sole authority for creating and resuming executable sessions.

`YISHAN_DSH_TEST_REPLAY=1` is a test-only direct-launch switch for the packaged runtime. It installs the local deterministic `smoke-replay` adapter for the production-bundle smoke test. No other value enables it. Daemon configuration does not enable or forward this switch. It must not be used in production launches.

The pinned `JsonRpcLineTransport` serializes rejected handlers as JSON-RPC `-32603` errors and does not support custom error data. Policy denials therefore use the stable `YISHAN_STOCK_SESSION_EXECUTION_DENIED` message prefix; stdio clients must match that prefix rather than expect JSON-RPC error `data`.

Current protocol foundations cover:

- workspace-scoped DSH session list, read, and resume contracts;
- cancel, dispose, flush, list, read, and resume method names;
- durable cursors and transcript resets;
- daemon capability and desktop interaction reverse requests;
- dispatch between stock SDK methods and Yishan extensions.

Run checks with:

```bash
bun run test
bun run typecheck
bun run lint
```
