<p align="center">
  <img src="apps/desktop/src/assets/images/yishan-transparent.png" alt="Yishan logo" width="100" height="100" />
</p>

<h1 align="center">Yishan</h1>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Elastic--2.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/yishan-io/yishan-mono/actions/workflows/pr-unit-tests.yml"><img src="https://github.com/yishan-io/yishan-mono/actions/workflows/pr-unit-tests.yml/badge.svg" alt="PR Unit Tests" /></a>
  <a href="https://github.com/yishan-io/yishan-mono/actions/workflows/desktop-release.yml"><img src="https://github.com/yishan-io/yishan-mono/actions/workflows/desktop-release.yml/badge.svg" alt="Desktop Release" /></a>
  <a href="https://github.com/yishan-io/yishan-mono/stargazers"><img src="https://img.shields.io/github/stars/yishan-io/yishan-mono?style=social" alt="GitHub stars" /></a>
</p>

**The workspace built for parallel minds.**

Agents made parallel work easy. Managing it is still on you. Yishan fixes that.

<p align="center">
  <img src="https://raw.githubusercontent.com/yishan-io/yishan-mono/main/apps/landing/public/app.png" alt="Yishan — from zero to multiple parallel workstreams" width="100%" />
</p>

## Why Yishan?

Tools were built for serial work. The work is now parallel.

Agents let you spin up concurrent tasks — fixing a bug, refactoring a module, reviewing code — all at once. But each workstream runs in its own terminal, repo, or chat tab. The burden of monitoring, switching, and resuming still falls entirely on you.

Yishan gives every task a living workspace. Switch between them without losing state.

## Core Features

- **Isolated workspaces** — each task gets its own branch, terminal, and file state. Parallel work never collides.
- **Live status across all workstreams** — see every task's state — running, waiting, done — in one view without opening each terminal.
- **Leave it running, come back when ready** — start a task, switch to something more urgent, return later without paying any setup cost. Everything stays exactly as you left it.
- **Built-in shared context** — `.my-context` keeps notes, plans, and handoff details attached to the project, visible across every workspace. Pick up any task without rebuilding context from scratch.
- **Agent sessions tied to the workspace** — agent work runs inside the workspace alongside the repo and terminal, not in a detached chat tab that loses context the moment you close it.

## More Ways to Work

- **Team collaboration** — share workspace status and hosts across your team. Everyone sees what's running, what's blocked, and who owns what.
- **Autopilot** — schedule recurring agent jobs on a cron cadence. Code review passes, health checks, weekly summaries — running automatically while you focus elsewhere.
- **PR status without leaving Yishan** — see pull request state, CI checks, and review status inline with the workspace.
- **Voice input** — dictate prompts and instructions hands-free. Works while you're away from the keyboard.

## Works With Your Tools

Yishan works alongside the agent CLIs you already use — OpenCode, Codex, Claude, Gemini, Cursor Agent, Pi, and Copilot.

## Roadmap

- Remote host workspaces — run workstreams on a remote machine *(in progress)*
- CLI + agent workflow integration — spawn multiple workspaces from chat or CLI *(in progress)*
- Development lifecycle management — issue to workspace to PR in one flow *(planned)*
- Mobile remote control — monitor and steer workspaces from your phone *(planned)*

## Getting Started

**Download for macOS** at [yishan.io](https://yishan.io).

To build from source and contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Links

- [Website](https://yishan.io)
- [Changelog](https://github.com/yishan-io/yishan-mono/releases)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE)
