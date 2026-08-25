# @yishan-io/dsh-yishan

Yishan-owned DeepSeek Harness composition contracts and plugins.

The package extends DSH SDK JSON-RPC with versioned `yishan.v1.*` methods. Stock SDK methods remain unchanged. One combined JSON-RPC server owns stdio; sibling plugins must not read stdin independently. The Yishan daemon exclusively owns this inherited channel and validates that each requested cwd is an open local workspace before forwarding it. The DSH handler then requires the persisted session header to match that cwd.

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
