---
name: yishan-memory
description: Use when you need durable Yishan project memory: search past decisions, read `.my-context/` files, or record a lasting decision or discovery with the `yishan memory` CLI.
---

# Yishan Memory

Durable project memory lives in `.my-context/`. The main file is `.my-context/MEMORY.md`. Use the `yishan memory` CLI. Do not edit `MEMORY.md` by hand: the CLI keeps the section layout and holds a cross-process lock.

## Commands

- `yishan memory search "<1-3 keywords>" --output json [--project-id <id>] [--scope project|global] [--limit N]`: search the memory index. Search is read-only and never rebuilds the index.
- `yishan memory read <path> [--project-root <dir>]`: read one file under `.my-context/`. The path is relative to `.my-context/` and cannot leave it. Try `MEMORY.md` first.
- `yishan memory store --section locked_decisions|durable_discoveries --entry "<text>" [--date YYYY-MM-DD]`: append one entry. For multi-line text use `--file <path>` or `--file -` with stdin.
- `yishan memory reconcile`: rebuild the index. Run it after `store` if you need the new entry to appear in search.

## When to search

Search before you change structure, reopen a past decision, or ask the user to repeat project history. Use few, specific keywords. Read the file a result points to before you rely on its snippet.

## What to store

Store only high-value facts that outlive this task:

- `locked_decisions`: a decision the user made, with the reason ("Why: ...").
- `durable_discoveries`: a root cause, a trap, or an invariant that is not obvious from the code.

Do not store task chatter, progress, or temporary notes. Put those in the task notes (see the `yishan-task` skill). Write each entry as one self-contained statement. Include the date. Do not store secrets.

## Failure handling

- Exit code 5 means a path outside `.my-context/`. Do not try to work around it.
- If `.my-context/` is missing, tell the user. Do not create a project root on your own.
