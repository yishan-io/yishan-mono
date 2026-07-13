# @yishan-io/pi-notify

Pi extension that forwards lifecycle events to the Yishan daemon for usage tracking and session monitoring.

## What it provides

This package registers a Pi extension that listens to agent lifecycle events (`agent_start`, `tool_execution_end`, `agent_settled`, `session_shutdown`) and forwards them to the Yishan notify script via `YISHAN_NOTIFY_SCRIPT_PATH`.

The extension only activates in Yishan-managed terminals (detected via `YISHAN_TERMINAL_ID`, `YISHAN_TAB_ID`, or `YISHAN_PANE_ID`).

## Installation

As a Pi package (installed automatically by the Yishan daemon):

```bash
pi install npm:@yishan-io/pi-notify
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `YISHAN_NOTIFY_SCRIPT_PATH` | Yes | Path to the notify script (set by Yishan daemon) |
| `YISHAN_TERMINAL_ID` | No | Gate: only activates in managed terminals |
| `YISHAN_TAB_ID` | No | Gate: only activates in managed terminals |
| `YISHAN_PANE_ID` | No | Gate: only activates in managed terminals |

## Lifecycle events forwarded

| Pi event | Notify event |
|---|---|
| `agent_start` | `Start` |
| `tool_execution_end` | `PostToolUse` |
| `agent_settled` | `Stop` |
| `session_shutdown` | `Stop` |

## License

MIT — see [LICENSE](./LICENSE).
