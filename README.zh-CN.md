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

**为并行思维者而生的工作区。**

Agent 让并行工作变得容易。管理它，还是靠你。Yishan 解决这个问题。

<p align="center">
  <img src="https://raw.githubusercontent.com/yishan-io/yishan-mono/main/apps/landing/public/app.png" alt="Yishan — 从零到多个并行工作流" width="100%" />
</p>

## 为什么需要 Yishan？

工具为串行工作而设计。工作已经是并行的了。

Agent 让你可以同时发起多个任务——修 bug、重构模块、代码审查——全部并发进行。但每个工作流跑在各自的终端、仓库或聊天标签页里。监控、切换、恢复的负担全压在你身上。

Yishan 为每个任务提供热活的工作区。在它们之间切换，不丢失任何状态。

## 核心功能

- **独立隔离的工作区** — 每个任务有自己的分支、终端和文件状态。并行工作永不冲突。
- **所有工作流的实时状态** — 在一个视图中看到每个任务的状态——运行中、等待、已完成——无需逐个打开终端。
- **放着不管，准备好了再回来** — 开始一个任务，切去处理更紧急的事，之后再回来，不需要任何重建成本。一切都保持你离开时的样子。
- **内置共享上下文** — `.my-context` 将笔记、计划和交接细节附着在项目上，所有工作区可见。拾起任何任务都无需从零重建上下文。
- **Agent 会话绑定在工作区里** — Agent 工作在工作区内运行，与仓库和终端并排，不是关掉就丢失上下文的独立聊天标签页。

## 更多功能

- **团队协作** — 在团队内共享工作区状态和主机资源。所有人都能看到什么在运行、什么卡住了、谁负责什么。
- **自动驾驶** — 按 cron 计划定时运行 Agent 任务。代码审查、健康检查、每周总结——在你专注其他事情的时候自动完成。
- **PR 状态不用跳出 Yishan** — 在工作区内直接看到 Pull Request 状态、CI 检查和 Review 进度。
- **语音输入** — 免手动输入，直接口述提示词和指令。离开键盘时同样可用。

## 与你已有的工具兼容

Yishan 与你已在使用的 Agent CLI 并行工作 — OpenCode、Codex、Claude、Gemini、Cursor Agent、Pi 和 Copilot。

## 路线图

- 远程主机工作区 — 在远程机器上启动工作流 *(进行中)*
- CLI + Agent 工作流集成 — 从聊天或 CLI 创建多个工作区 *(进行中)*
- 开发生命周期管理 — 从 Issue 到工作区再到 PR 的完整流程 *(计划中)*
- 移动端远程控制 — 通过手机监控和控制工作区 *(计划中)*

## 快速开始

**下载 macOS 版**请访问 [yishan.io](https://yishan.io)。

如需从源码构建和参与贡献，请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 链接

- [官网](https://yishan.io)
- [更新日志](https://github.com/yishan-io/yishan-mono/releases)
- [贡献指南](CONTRIBUTING.md)
- [许可证](LICENSE)
