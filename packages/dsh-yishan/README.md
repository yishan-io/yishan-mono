# @yishan-io/dsh-yishan

Yishan-owned DeepSeek Harness composition contracts and plugins.

The package extends DSH SDK JSON-RPC with versioned `yishan.v1.*` methods. Stock SDK methods remain unchanged. One combined JSON-RPC request router must own stdio; sibling plugins must not read stdin independently.

Current protocol foundations cover:

- daemon-owned session/workspace bindings;
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
