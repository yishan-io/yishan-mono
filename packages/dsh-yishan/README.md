# @yishan-io/dsh-yishan

Yishan-owned DeepSeek Harness composition contracts and plugins.

The package extends DSH SDK JSON-RPC with versioned `yishan.v1.*` methods. One combined JSON-RPC server owns stdio; sibling plugins must not read stdin independently. The Yishan daemon exclusively owns this inherited channel and validates that each requested cwd is an open local workspace before forwarding it. The DSH handler then requires the persisted session header to match that cwd.

Production composition is MCP-disabled (`YISHAN_RUNTIME_MCP_ENABLED` is `false`). Stock `initialize` and `shutdown` remain compatible, but stock `session/new` is denied and stock `session/prompt` is accepted only when `params.sessionId` is a non-empty string owned by `SessionRuntime`. Yishan session extensions are the sole authority for creating and resuming executable sessions.

## Breaking runtime API change (0.x)

The root `createSessionHandler` function and `SessionHandlerDependencies` type were removed. This is an intentional breaking change in the 0.x API; no compatibility wrapper is provided.
Yishan session request parser exports were also removed. The daemon owns these fixed command payloads; the runtime casts them at its internal boundary. Stock SDK input, external DSH events, JSONL persistence, and JSON-RPC envelopes remain strictly parsed.

Runtime RPC routes are now mounted directly by `rpc-server/plugin.ts`. `RpcServer` owns session runtime, session-query service, subagent service, stock SDK server, and stdio transport as one runtime composition. It authorizes and dispatches direct-subagent interrupts and publishes subagent lifecycle notifications without public handler factories. `createSubagentInterruptHandler`, `installSubagentLifecycleNotifications`, and their dependency types are no longer package exports. Session list, read, lineage, resume, and dispose DTOs remain protocol exports; the RPC server maps them directly from its owned services.

### Migration

Remove imports of `createSessionHandler` and `SessionHandlerDependencies` and delete custom dependency wiring. Create the supported runtime with `RuntimeHost.create()` from `@yishan-io/dsh-runtime`; it mounts the RPC plugin and its `yishan.v1.*` routes automatically.

```ts
import { RuntimeHost } from "@yishan-io/dsh-runtime";

const host = await RuntimeHost.create();
// Call host.close() when the embedding application stops.
```

Do not register a separate session handler or create a second JSON-RPC stdio server. Integrations that require different RPC behavior must compose the runtime plugin rather than recreate its removed handler dependencies.

`YISHAN_DSH_TEST_REPLAY=1` is a test-only direct-launch switch for the packaged runtime. It installs the local deterministic `smoke-replay` adapter for the production-bundle smoke test. No other value enables it. Daemon configuration does not enable or forward this switch. It must not be used in production launches.

The pinned `JsonRpcLineTransport` serializes rejected handlers as JSON-RPC `-32603` errors and does not support custom error data. Policy denials therefore use the stable `YISHAN_STOCK_SESSION_EXECUTION_DENIED` message prefix; stdio clients must match that prefix rather than expect JSON-RPC error `data`.

Managed official DSH bundle installs require an exact Yishan-audited, data-only adaptation manifest binding package, version, SRI, manifest version, and manifest hash. Normal mode has no compatible official bundles until such a manifest is reviewed. The runtime never executes upstream `cordis.patch.yml`; that format remains Developer Mode local-path only.

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
