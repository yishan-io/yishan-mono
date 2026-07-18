# @yishan-io/pi-ask

Pi extension package that adds an interactive `ask_user` tool for collecting explicit user decisions during an agent run.

## What it provides

MVP features:
- single-select questions
- multi-select questions
- optional freeform/custom typed answers
- optional context text shown with the question
- sequential tool execution so the agent waits for the answer
- structured result details for rendering and session reconstruction
- fallback behavior for RPC and non-interactive modes

## Installation

As a Pi package:

```bash
pi install /absolute/path/to/packages/pi-ask
```

Or from a checked-out monorepo path:

```bash
pi install ./packages/pi-ask
```

## Tool name

- `ask_user`

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `question` | `string` | required | The question to ask the user |
| `context` | `string?` | — | Optional context shown with the question |
| `options` | `string[] \| {title, description?, label?, text?, value?, name?, option?}[]` | `[]` | Selectable options; alias keys are normalized at runtime |
| `allowMultiple` | `boolean?` | `false` | Allow selecting multiple options |
| `allowFreeform` | `boolean?` | `true` | Allow typing a custom answer |

## Result details

`ask_user` returns structured `details` with:
- `question`
- `context`
- normalized `options`
- `response`
- `cancelled`
- `unavailableReason` when interactive UI is unavailable

## Example

```json
{
  "question": "Which environment should we use?",
  "context": "We need one target for the next deployment.",
  "options": [
    { "title": "staging" },
    { "label": "production", "description": "Customer-facing" }
  ],
  "allowMultiple": false,
  "allowFreeform": true
}
```

## Mode behavior

- `tui`: uses custom interactive UI
- `rpc`: uses dialog-style `select` / `input` fallbacks
- `json` / `print`: returns structured unavailable results instead of crashing

## Deferred from upstream `pi-ask-user`

The first version intentionally does not include:
- searchable single-select filtering
- split-pane preview UI
- overlay hide/show shortcuts
- optional selection comments
- env-var driven UI customization

## Development

Package-local checks:

```bash
bun run --cwd packages/pi-ask typecheck
bun run --cwd packages/pi-ask lint
bun run --cwd packages/pi-ask test
```

## License

MIT — see [LICENSE](./LICENSE).
